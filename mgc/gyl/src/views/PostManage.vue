<!-- 这个文件是什么作用显示的是什么：这是岗位管理页面。显示/实现的是：公司各个岗位的列表、基本信息以及岗位的增删改查表格。 -->
<script setup lang="ts">
/**
 * 岗位管理页面
 * 管理三级组织架构下的岗位信息
 */
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  flattenDeptTree,
  getDeptPathName,
  type PostItem
} from '@/data/mockData'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const { posts: tableData, departments: departmentTree } = storeToRefs(appStore)

// 搜索
const searchName = ref('')
const searchStatus = ref<number | undefined>(undefined)

// 分页
const currentPage = ref(1)
const pageSize = ref(10)

const filteredData = computed(() => {
  return tableData.value.filter(p => {
    const matchName = !searchName.value || p.name.includes(searchName.value) || p.code.includes(searchName.value)
    const matchStatus = searchStatus.value === undefined || p.status === searchStatus.value
    return matchName && matchStatus
  })
})

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredData.value.slice(start, end)
})

import { watch } from 'vue'
watch([searchName, searchStatus], () => {
  currentPage.value = 1
})

// 弹窗
const dialogVisible = ref(false)
const dialogTitle = ref('新增岗位')
const isEdit = ref(false)

const formRef = ref()
const formData = reactive({
  id: 0,
  name: '',
  code: '',
  deptId: 0,
  deptIds: [] as number[],
  status: 1,
  sort: 0,
  remark: ''
})

const deptCascaderOptions = computed(() => flattenDeptTree(departmentTree.value))

const rules = {
  name: [{ required: true, message: '请输入岗位名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入岗位编码', trigger: 'blur' }],
  deptIds: [{ required: true, message: '请选择归属部门', trigger: 'change' }]
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

function handleAdd() {
  if (!checkSuperAdmin()) return
  isEdit.value = false
  dialogTitle.value = '新增岗位'
  Object.assign(formData, {
    id: Date.now(),
    name: '',
    code: '',
    deptId: 0,
    deptIds: [],
    status: 1,
    sort: tableData.value.length + 1,
    remark: ''
  })
  dialogVisible.value = true
}

function handleEdit(row: PostItem) {
  if (!checkSuperAdmin()) return
  isEdit.value = true
  dialogTitle.value = `编辑岗位 - ${row.name}`
  const cascadePath = findCascaderPath(row.deptId, deptCascaderOptions.value)
  Object.assign(formData, {
    id: row.id,
    name: row.name,
    code: row.code,
    deptId: row.deptId,
    deptIds: cascadePath,
    status: row.status,
    sort: row.sort,
    remark: row.remark || ''
  })
  dialogVisible.value = true
}

function findCascaderPath(targetId: number, options: any[], path: number[] = []): number[] {
  for (const opt of options) {
    const currentPath = [...path, opt.value]
    if (opt.value === targetId) return currentPath
    if (opt.children) {
      const result = findCascaderPath(targetId, opt.children, currentPath)
      if (result.length > 0) return result
    }
  }
  return []
}

async function handleDelete(row: PostItem) {
  if (!checkSuperAdmin()) return
  try {
    await ElMessageBox.confirm(`确认删除岗位 "${row.name}" (${row.code}) 吗？`, '删除确认', { type: 'warning' })
    await axios.delete(`${API_BASE}/jobtitles/${row.id}`)
    await appStore.fetchSystemData()
    ElMessage.success('删除成功')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败: ' + (err.response?.data?.msg || err.message))
    }
  }
}

import axios from 'axios'
const API_BASE = 'http://localhost:3000/api'

async function handleSubmit() {
  await formRef.value?.validate()
  const lastDeptId = formData.deptIds[formData.deptIds.length - 1] as number

  const payload = {
    id: formData.id,
    name: formData.name,
    code: formData.code,
    deptId: lastDeptId,
    status: formData.status,
    sort: formData.sort,
    remark: formData.remark
  }

  try {
    if (isEdit.value) {
      await axios.put(`${API_BASE}/jobtitles/${formData.id}`, payload)
      ElMessage.success('编辑成功')
    } else {
      await axios.post(`${API_BASE}/jobtitles`, payload)
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
        <div class="stat-card-icon blue"><el-icon><Stamp /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.length }}</h3>
          <p>岗位总数</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon teal"><el-icon><CircleCheck /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.filter(p => p.status === 1).length }}</h3>
          <p>启用岗位</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon amber"><el-icon><OfficeBuilding /></el-icon></div>
        <div class="stat-card-info">
          <h3>7</h3>
          <p>覆盖部门</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon rose"><el-icon><Warning /></el-icon></div>
        <div class="stat-card-info">
          <h3>{{ tableData.filter(p => p.status === 0).length }}</h3>
          <p>已停用</p>
        </div>
      </div>
    </div>

    <!-- 主卡片 -->
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon class="icon"><Stamp /></el-icon>
          岗位列表
        </div>
      </div>

      <div class="toolbar" style="margin-bottom: 16px">
        <el-input v-model="searchName" placeholder="搜索岗位名称/编码" clearable style="width: 240px" prefix-icon="Search" />
        <el-select v-model="searchStatus" placeholder="状态" clearable style="width: 120px">
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <div class="toolbar-right">
          <el-button type="primary" @click="handleAdd" :disabled="!isSuperAdmin">
            <el-icon><Plus /></el-icon> 新增岗位
          </el-button>
          <el-button>
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>

      <el-table :data="paginatedData" border stripe style="width: 100%">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column prop="name" label="岗位名称" min-width="160">
          <template #default="{ row }">
            <span style="font-weight: 500">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="岗位编码" width="160">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" type="info">{{ row.code }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deptName" label="归属部门" min-width="220">
          <template #default="{ row }">
            <span style="color: var(--text-secondary)">{{ row.deptName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <span class="status-tag" :class="row.status === 1 ? 'active' : 'disabled'">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block;"></span>
              {{ row.status === 1 ? '正常' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160">
          <template #default="{ row }">
            <span style="color: var(--text-muted)">{{ row.remark || '-' }}</span>
          </template>
        </el-table-column>
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

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="90px">
        <el-form-item label="岗位名称" prop="name">
          <el-input v-model="formData.name" placeholder="如：奶牛育种专员" />
        </el-form-item>
        <el-form-item label="岗位编码" prop="code">
          <el-input v-model="formData.code" placeholder="如：POST_BREED" />
        </el-form-item>
        <el-form-item label="归属部门" prop="deptIds">
          <el-cascader
            v-model="formData.deptIds"
            :options="deptCascaderOptions"
            :props="{ checkStrictly: true, expandTrigger: 'hover' }"
            placeholder="请选择归属部门"
            clearable
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="formData.status">
            <el-radio :value="1">正常</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="formData.remark" type="textarea" :rows="3" placeholder="岗位职责说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="handleSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>
