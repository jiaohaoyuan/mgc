<!-- 这个文件是什么作用显示的是什么：这是部门管理页面。显示/实现的是：公司组织架构中的部门列表及组织树、添加与编辑表单。 -->
<script setup lang="ts">
/**
 * 部门管理页面
 * 树形表格展示三级组织架构，支持增删改操作
 */
import { ref, reactive, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { DeptNode } from '@/data/mockData'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const { departments: tableData } = storeToRefs(appStore)
const defaultExpandedKeys = ref([100, 110, 120, 130])

// 搜索
const searchName = ref('')

// 弹窗控制
const dialogVisible = ref(false)
const dialogTitle = ref('新增部门')
const isEdit = ref(false)

// 表单数据
const formRef = ref()
const formData = reactive({
  id: 0,
  parentId: 0,
  label: '',
  type: 'team' as 'center' | 'department' | 'team',
  status: 1,
  sort: 0,
  leader: '',
  phone: '',
  email: ''
})

const typeOptions = [
  { label: '一级中心', value: 'center' },
  { label: '二级部门', value: 'department' },
  { label: '三级小组/岗位', value: 'team' }
]

const rules = {
  label: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择部门类型', trigger: 'change' }]
}

// 获取类型标签
function getTypeTag(type: string) {
  const map: Record<string, { text: string; type: string }> = {
    center: { text: '中心', type: 'danger' },
    department: { text: '部门', type: 'warning' },
    team: { text: '岗位', type: '' }
  }
  return map[type] || { text: '未知', type: 'info' }
}

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

// 新增子部门
function handleAdd(row?: DeptNode) {
  if (!checkSuperAdmin()) return
  isEdit.value = false
  dialogTitle.value = row ? `新增子部门 - ${row.label}` : '新增部门'
  Object.assign(formData, {
    id: Date.now(),
    parentId: row ? row.id : 100,
    label: '',
    type: row ? (row.type === 'center' ? 'department' : 'team') : 'center',
    status: 1,
    sort: 0,
    leader: '',
    phone: '',
    email: ''
  })
  dialogVisible.value = true
}

// 编辑部门
function handleEdit(row: DeptNode) {
  if (!checkSuperAdmin()) return
  isEdit.value = true
  dialogTitle.value = `编辑部门 - ${row.label}`
  Object.assign(formData, {
    id: row.id,
    parentId: 0,
    label: row.label,
    type: row.type,
    status: row.status,
    sort: row.sort,
    leader: row.leader || '',
    phone: row.phone || '',
    email: row.email || ''
  })
  dialogVisible.value = true
}

// 删除部门
async function handleDelete(row: DeptNode) {
  if (!checkSuperAdmin()) return
  if (row.children && row.children.length > 0) {
    ElMessage.warning('该部门下存在子部门，请先删除子部门')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除部门 "${row.label}" 吗？删除前请确认下无在职员工。`,
      '删除确认',
      { type: 'warning' }
    )
    await axios.delete(`${API_BASE}/departments/${row.id}`)
    await appStore.fetchSystemData()
    ElMessage.success('删除成功')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败: ' + (err.response?.data?.msg || err.message))
    }
  }
}

import axios from 'axios'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'

// 保存表单
async function handleSubmit() {
  await formRef.value?.validate()
  try {
    if (isEdit.value) {
      await axios.put(`${API_BASE}/departments/${formData.id}`, formData)
      ElMessage.success('编辑成功')
    } else {
      await axios.post(`${API_BASE}/departments`, formData)
      ElMessage.success('新增成功')
    }
    await appStore.fetchSystemData()
    dialogVisible.value = false
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err.response?.data?.msg || err.message))
  }
}


function updateNode(nodes: DeptNode[], id: number, data: any) {
  for (const n of nodes) {
    if (n.id === id) {
      Object.assign(n, { label: data.label, type: data.type, status: data.status, sort: data.sort, leader: data.leader, phone: data.phone, email: data.email })
      return true
    }
    if (n.children && updateNode(n.children, id, data)) return true
  }
  return false
}

function addChildNode(nodes: DeptNode[], parentId: number, child: DeptNode) {
  for (const n of nodes) {
    if (n.id === parentId) {
      if (!n.children) n.children = []
      n.children.push(child)
      return true
    }
    if (n.children && addChildNode(n.children, parentId, child)) return true
  }
  return false
}

// 动态统计逻辑
import { computed } from 'vue'
const stats = computed(() => {
  let centers = 0
  let depts = 0
  let teams = 0
  
  const traverse = (nodes: DeptNode[]) => {
    nodes.forEach(n => {
      if (n.type === 'center') centers++
      else if (n.type === 'department') depts++
      else if (n.type === 'team') teams++
      if (n.children) traverse(n.children)
    })
  }
  traverse(tableData.value)
  
  return {
    centers,
    depts,
    teams,
    employees: appStore.users.length
  }
})
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card" style="animation-delay: 0s">
        <div class="stat-card-icon blue">
          <el-icon><OfficeBuilding /></el-icon>
        </div>
        <div class="stat-card-info">
          <h3>{{ stats.centers }}</h3>
          <p>一级中心</p>
        </div>
      </div>
      <div class="stat-card" style="animation-delay: 0.05s">
        <div class="stat-card-icon teal">
          <el-icon><School /></el-icon>
        </div>
        <div class="stat-card-info">
          <h3>{{ stats.depts }}</h3>
          <p>二级部门</p>
        </div>
      </div>
      <div class="stat-card" style="animation-delay: 0.1s">
        <div class="stat-card-icon amber">
          <el-icon><Stamp /></el-icon>
        </div>
        <div class="stat-card-info">
          <h3>{{ stats.teams }}</h3>
          <p>三级岗位</p>
        </div>
      </div>
      <div class="stat-card" style="animation-delay: 0.15s">
        <div class="stat-card-icon rose">
          <el-icon><User /></el-icon>
        </div>
        <div class="stat-card-info">
          <h3>{{ stats.employees }}</h3>
          <p>在职人员</p>
        </div>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon class="icon"><OfficeBuilding /></el-icon>
          组织架构树
        </div>
        <div class="toolbar">
          <el-input v-model="searchName" placeholder="搜索部门名称" clearable style="width: 220px" prefix-icon="Search" />
          <el-button type="primary" @click="handleAdd()" :disabled="!isSuperAdmin">
            <el-icon><Plus /></el-icon> 新增部门
          </el-button>
          <el-button @click="defaultExpandedKeys = [100, 110, 120, 130, 111, 112, 113, 121, 122, 131, 132]">
            <el-icon><Sort /></el-icon> 全部展开
          </el-button>
        </div>
      </div>

      <el-table
        :data="tableData"
        row-key="id"
        :default-expand-all="false"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        border
        stripe
        style="width: 100%"
      >
        <el-table-column prop="label" label="部门名称" min-width="260">
          <template #default="{ row }">
            <span style="font-weight: 500">{{ row.label }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="层级" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getTypeTag(row.type).type as any" size="small" effect="plain">
              {{ getTypeTag(row.type).text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="leader" label="负责人" width="120" align="center">
          <template #default="{ row }">
            {{ row.leader || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <span class="status-tag" :class="row.status === 1 ? 'active' : 'disabled'">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block;"></span>
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleAdd(row)" :disabled="!isSuperAdmin">
              <el-icon><Plus /></el-icon> 新增
            </el-button>
            <el-button link type="primary" size="small" @click="handleEdit(row)" :disabled="!isSuperAdmin">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)" :disabled="!isSuperAdmin || row.id === 100">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="90px">
        <el-form-item label="部门名称" prop="label">
          <el-input v-model="formData.label" placeholder="请输入部门名称" />
        </el-form-item>
        <el-form-item label="部门类型" prop="type">
          <el-select v-model="formData.type" placeholder="选择类型" style="width: 100%">
            <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="formData.leader" placeholder="请输入负责人" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="formData.phone" placeholder="手机号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="formData.email" placeholder="邮箱" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="状态">
          <el-radio-group v-model="formData.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="handleSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
