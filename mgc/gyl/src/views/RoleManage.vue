<!-- 这个文件是什么作用显示的是什么：这是角色管理页面。显示/实现的是：系统角色的列表以及为各个角色分配特定权限的界面。 -->
<script setup lang="ts">
/**
 * 角色管理页面
 * 实现角色CRUD，带Tabs编辑界面：
 *   Tab 1 - 功能权限：树形复选框（含按钮级权限）
 *   Tab 2 - 关联岗位：实现"一角色多岗位"跨部门勾选
 */
import { ref, reactive, computed, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  type RoleItem,
  type PermNode
} from '@/data/mockData'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const { roles: tableData, permissionTree } = storeToRefs(appStore)

const postList = appStore.posts
const pageNameMap = appStore.pageNameMap

// 搜索
const searchName = ref('')

// 分页
const currentPage = ref(1)
const pageSize = ref(10)

const filteredData = computed(() => {
  if (!searchName.value) return tableData.value
  return tableData.value.filter(r =>
    r.name.includes(searchName.value) || r.code.includes(searchName.value)
  )
})

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredData.value.slice(start, end)
})

watch([searchName], () => {
  currentPage.value = 1
})

// 弹窗
const dialogVisible = ref(false)
const dialogTitle = ref('新增角色')
const isEdit = ref(false)
const activeTab = ref('permissions')

// 表单
const formRef = ref()
const permTreeRef = ref()
const formData = reactive({
  id: 0,
  name: '',
  code: '',
  sort: 0,
  status: 1,
  remark: '',
  permissionIds: [] as number[],
  postIds: [] as number[]
})

const rules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }]
}

// 岗位分组（按二级部门分组）
const postGroups = computed(() => {
  const groups: Record<string, any[]> = {}
  postList.forEach(p => {
    const deptName = p.deptName.split(' / ')[0] || '其他'
    if (!groups[deptName]) groups[deptName] = []
    groups[deptName].push(p)
  })
  return groups
})

// 获取权限名称列表（使用 DB 页面表的名称）
function getPermNames(ids: number[]): string[] {
  if (!ids || ids.length === 0) return []
  return ids.map(id => pageNameMap[id]).filter(Boolean) as string[]
}

// 获取岗位名称
function getPostNames(ids: any[]): string[] {
  return (postList as any[]).filter(p => ids.some((id: any) => p.id == id)).map(p => p.name)
}

// 全选/全不选权限
const checkAll = ref(false)
function handleCheckAllPerm(val: boolean) {
  if (val) {
    const allIds: number[] = []
    function walk(nodes: PermNode[]) {
      for (const n of nodes) {
        allIds.push(n.id)
        if (n.children) walk(n.children)
      }
    }
    walk(permissionTree.value)
    nextTick(() => {
      permTreeRef.value?.setCheckedKeys(allIds)
    })
  } else {
    nextTick(() => {
      permTreeRef.value?.setCheckedKeys([])
    })
  }
}

// 展开/收起
const expandAll = ref(true)

// 权限检查：只有超级管理员可操作
const isSuperAdmin = computed(() => {
  try {
    const s = localStorage.getItem('currentUser')
    const user = s ? JSON.parse(s) : null
    return user?.role === '超级管理员'
  } catch { return false }
})

function checkSuperAdmin(): boolean {
  if (!isSuperAdmin.value) {
    ElMessage.warning('只有超级管理员可操作，普通用户禁止操作')
    return false
  }
  return true
}

// 新增角色
function handleAdd() {
  if (!checkSuperAdmin()) return
  isEdit.value = false
  dialogTitle.value = '新增角色'
  activeTab.value = 'permissions'
  Object.assign(formData, {
    id: Date.now(),
    name: '',
    code: '',
    sort: 0,
    status: 1,
    remark: '',
    permissionIds: [],
    postIds: []
  })
  dialogVisible.value = true
  nextTick(() => {
    permTreeRef.value?.setCheckedKeys([])
  })
}

// 编辑角色
function handleEdit(row: RoleItem) {
  if (!checkSuperAdmin()) return
  isEdit.value = true
  dialogTitle.value = `编辑角色 - ${row.name}`
  activeTab.value = 'permissions'
  Object.assign(formData, {
    id: row.id,
    name: row.name,
    code: row.code,
    sort: row.sort,
    status: row.status,
    remark: row.remark || '',
    permissionIds: [...row.permissionIds],
    postIds: [...row.postIds]
  })
  dialogVisible.value = true
  nextTick(() => {
    // 只设置叶子节点，避免全选父节点
    const leafIds = getLeafIds(row.permissionIds)
    permTreeRef.value?.setCheckedKeys(leafIds)
  })
}

// 获取叶子节点ID
function getLeafIds(ids: number[]): number[] {
  const parentIds = new Set<number>()
  function walk(nodes: PermNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        parentIds.add(n.id)
        walk(n.children)
      }
    }
  }
  walk(permissionTree.value)
  return ids.filter(id => !parentIds.has(id))
}

// 删除角色
async function handleDelete(row: RoleItem) {
  if (!checkSuperAdmin()) return
  if (row.code === 'ROLE_ADMIN' || row.id == 1) {
    ElMessage.warning('超级管理员角色不可删除')
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除角色 "${row.name}" 吗？`, '删除确认', { type: 'warning' })
    await axios.delete(`${API_BASE}/roles/${row.id}`)
    await appStore.fetchSystemData()
    ElMessage.success('删除成功')
  } catch (err) {
    if (err !== 'cancel') {
        ElMessage.error('删除失败')
    }
  }
}

import axios from 'axios'
const API_BASE = 'http://localhost:3000/api'

// 保存
async function handleSubmit() {
  await formRef.value?.validate()

  // 获取选中的权限ID（包含半选的父节点）
  const checkedIds = permTreeRef.value?.getCheckedKeys() || []
  const halfCheckedIds = permTreeRef.value?.getHalfCheckedKeys() || []
  const allPermIds = [...checkedIds, ...halfCheckedIds]

  const payload = {
    id: formData.id,
    name: formData.name,
    code: formData.code,
    sort: formData.sort,
    status: formData.status,
    permissionIds: allPermIds,
    postIds: [...formData.postIds],
    remark: formData.remark
  }

  try {
    if (isEdit.value) {
      await axios.put(`${API_BASE}/roles/${formData.id}`, payload)
      ElMessage.success('编辑成功')
    } else {
      await axios.post(`${API_BASE}/roles`, payload)
      ElMessage.success('新增成功')
    }
    await appStore.fetchSystemData()
    dialogVisible.value = false
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err.response?.data?.msg || err.message))
  }
}
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-card-icon blue"><el-icon><Key /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.length }}</h3>
          <p>角色总数</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon teal"><el-icon><CircleCheck /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.filter(r => r.status === 1).length }}</h3>
          <p>启用角色</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon amber"><el-icon><Lock /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ permissionTree.reduce((sum, n) => sum + (n.children?.length || 0), 0) }}</h3>
          <p>权限模块</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon rose"><el-icon><Stamp /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ postList.length }}</h3>
          <p>可关联岗位</p>
        </div>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon class="icon"><Key /></el-icon>
          角色列表
        </div>
      </div>

      <div class="toolbar" style="margin-bottom: 16px">
        <el-input v-model="searchName" placeholder="搜索角色名称/编码" clearable style="width: 240px" prefix-icon="Search" />
        <div class="toolbar-right">
          <el-button type="primary" @click="handleAdd" :disabled="!isSuperAdmin">
            <el-icon><Plus /></el-icon> 新增角色
          </el-button>
        </div>
      </div>

      <el-table :data="paginatedData" border stripe style="width: 100%">
        <el-table-column prop="name" label="角色名称" width="150">
          <template #default="{ row }">
            <span style="font-weight: 500">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="角色编码" width="160">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" type="info">{{ row.code }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column label="功能权限" min-width="260">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px">
              <el-tag
                v-for="name in getPermNames(row.permissionIds).slice(0, 5)"
                :key="name"
                size="small"
                effect="plain"
                type="success"
              >{{ name }}</el-tag>
              <el-tag v-if="getPermNames(row.permissionIds).length > 5" size="small" type="info" effect="plain">
                +{{ getPermNames(row.permissionIds).length - 5 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="关联岗位" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px">
              <el-tag
                v-for="name in getPostNames(row.postIds)"
                :key="name"
                size="small"
                effect="plain"
                type="warning"
              >{{ name }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <span class="status-tag" :class="row.status === 1 ? 'active' : 'disabled'">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block;"></span>
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="120" align="center" />
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleEdit(row)" :disabled="!isSuperAdmin">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)" :disabled="!isSuperAdmin">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display: flex; justify-content: flex-end; margin-top: 16px">
        <el-pagination 
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          background 
          layout="total, sizes, prev, pager, next" 
          :total="filteredData.length" 
          :page-sizes="[10, 20, 50]" 
        />
      </div>
    </div>

    <!-- 角色编辑弹窗（带 Tabs） -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="780px" destroy-on-close top="5vh">
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="90px">
        <!-- 基本信息 -->
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px">基本信息</div>
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="角色名称" prop="name">
                <el-input v-model="formData.name" placeholder="如：计划核算员" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="角色编码" prop="code">
                <el-input v-model="formData.code" placeholder="如：ROLE_PLANNER" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="排序">
                <el-input-number v-model="formData.sort" :min="0" :max="999" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="状态">
                <el-switch v-model="formData.status" :active-value="1" :inactive-value="0" active-text="启" inactive-text="停" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="备注">
            <el-input v-model="formData.remark" type="textarea" :rows="2" placeholder="角色描述" />
          </el-form-item>
        </div>

        <!-- Tabs: 功能权限 + 关联岗位 -->
        <el-tabs v-model="activeTab" type="border-card">
          <!-- Tab 1: 功能权限 -->
          <el-tab-pane label="功能权限" name="permissions">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 0 4px">
              <div style="display: flex; align-items: center; gap: 12px">
                <el-checkbox v-model="checkAll" @change="handleCheckAllPerm">全选/全不选</el-checkbox>
              </div>
              <el-tag type="info" size="small" effect="plain">
                已选 {{ permTreeRef?.getCheckedKeys()?.length || 0 }} 项权限
              </el-tag>
            </div>
            <div style="max-height: 340px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px">
              <el-tree
                ref="permTreeRef"
                :data="permissionTree"
                show-checkbox
                node-key="id"
                :default-expand-all="expandAll"
                :props="{ children: 'children', label: 'label' }"
                class="permission-tree"
              >
                <template #default="{ node, data }">
                  <span style="font-size: 13px; display: flex; align-items: center; gap: 6px">
                    <el-icon v-if="!data.code" style="color: var(--primary-color)"><Folder /></el-icon>
                    <el-icon v-else style="color: var(--accent-teal)"><Key /></el-icon>
                    {{ data.label }}
                    <span v-if="data.code" style="color: var(--text-muted); font-size: 11px; background: #f1f5f9; padding: 1px 6px; border-radius: 3px;">
                      {{ data.code }}
                    </span>
                  </span>
                </template>
              </el-tree>
            </div>
          </el-tab-pane>

          <!-- Tab 2: 关联岗位 -->
          <el-tab-pane label="关联岗位" name="posts">
            <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary)">
              <el-icon><InfoFilled /></el-icon>
              勾选该角色适用的岗位，支持跨部门多选（实现"一角色多岗位"逻辑）
            </div>
            <div style="max-height: 340px; overflow-y: auto">
              <div v-for="(posts, groupName) in postGroups" :key="groupName as string" style="margin-bottom: 16px">
                <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); padding: 8px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px">
                  <el-icon style="color: var(--primary-color)"><OfficeBuilding /></el-icon>
                  {{ groupName }}
                </div>
                <el-checkbox-group v-model="formData.postIds">
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; padding-left: 8px">
                    <el-checkbox
                      v-for="p in posts"
                      :key="p.id"
                      :value="p.id"
                      :label="p.id"
                      style="margin: 0"
                    >
                      <span style="font-size: 13px">{{ p.name }}</span>
                      <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px">({{ p.code }})</span>
                    </el-checkbox>
                  </div>
                </el-checkbox-group>
              </div>
            </div>
            <div style="margin-top: 12px; padding: 8px 12px; background: #f0fdfa; border-radius: 6px; font-size: 12px; color: var(--accent-teal)">
              <el-icon><InfoFilled /></el-icon>
              已关联 {{ formData.postIds.length }} 个岗位
              <template v-if="formData.postIds.length > 0">
                ：{{ getPostNames(formData.postIds).join('、') }}
              </template>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="handleSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
