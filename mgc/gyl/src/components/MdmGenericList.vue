<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Search, RefreshLeft } from '@element-plus/icons-vue'
import axios from 'axios'

interface Props {
  entityName: string;
  apiPath: string;
  icon?: string;
  idField?: string;
  searchPlaceholder?: string;
  formFields: any;
  formRules?: any;
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'Box',
  idField: 'id',
  searchPlaceholder: '编码/名称',
  formRules: () => ({})
})

const loading = ref(false)
const tableData = ref<any[]>([])
const total = ref(0)
const selectedRows = ref<any[]>([])
const queryParams = reactive<any>({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: ''
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get(props.apiPath, { params: queryParams })
    if (res.data.code === 200) {
      tableData.value = res.data.data.list
      total.value = res.data.data.total
    } else {
      ElMessage.error(res.data.msg)
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.page = 1
  fetchList()
}

const handleReset = () => {
  Object.assign(queryParams, {
    page: 1,
    keyword: '',
    status: ''
  })
  fetchList()
}

const handleSelectionChange = (s: any[]) => {
  selectedRows.value = s
}

const dialogVisible = ref(false)
const formRef = ref()
const isEdit = ref(false)
const editId = ref<any>(null)
const form = reactive({ ...props.formFields })

const openAdd = () => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { ...props.formFields })
  dialogVisible.value = true
}

const openEdit = (row: any) => {
  isEdit.value = true
  editId.value = row[props.idField]
  Object.assign(form, row)
  dialogVisible.value = true
}

const submitForm = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const res = isEdit.value
      ? await axios.put(`${props.apiPath}/${editId.value}`, form)
      : await axios.post(props.apiPath, form)
    if (res.data.code === 200) {
      ElMessage.success(isEdit.value ? '编辑成功' : '新增成功')
      dialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除该条记录？`, '删除确认', { type: 'warning' })
    const res = await axios.delete(`${props.apiPath}/${row[props.idField]}`)
    if (res.data.code === 200) {
      ElMessage.success('删除成功')
      fetchList()
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.msg || '')
  }
}

const handleBatchDelete = async () => {
  if (selectedRows.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确认批量停用选中的 ${selectedRows.value.length} 条记录？`, '操作确认', { type: 'warning' })
    const ids = selectedRows.value.map(r => r[props.idField])
    const res = await axios.delete(`${props.apiPath}/batch`, { data: { ids } })
    if (res.data.code === 200) {
      ElMessage.success('操作成功')
      fetchList()
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.msg || '')
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="mdm-container">
    <div class="page-header">
      <div class="page-title">
        <span class="title-icon">📦</span>
        <div>
          <h2>{{ entityName }}管理</h2>
          <p class="subtitle">Master Data · {{ entityName }} List</p>
        </div>
      </div>
      <div class="header-actions">
        <el-button type="danger" plain size="small" :icon="Delete" :disabled="!selectedRows.length" @click="handleBatchDelete">批量停用</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">新增{{ entityName }}</el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-form :inline="true" :model="queryParams" @submit.prevent="handleSearch" class="filter-form">
        <el-form-item label="关键字">
          <el-input
            v-model="queryParams.keyword"
            :placeholder="searchPlaceholder"
            clearable
            style="width: 200px"
            :prefix-icon="Search"
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="数据状态">
          <el-select v-model="queryParams.status" placeholder="全部" clearable style="width: 100px" @change="handleSearch">
            <el-option label="启用" value="1" />
            <el-option label="停用" value="0" />
          </el-select>
        </el-form-item>
        <slot name="filters" :queryParams="queryParams"></slot>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="RefreshLeft" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-table v-loading="loading" :data="tableData" border stripe @selection-change="handleSelectionChange" class="sku-table">
      <el-table-column type="selection" width="46" align="center" />
      <slot name="columns"></slot>
      <el-table-column prop="status" label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status ? 'success' : 'danger'" size="small">{{ row.status ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-divider direction="vertical" />
          <el-button link type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="queryParams.page"
        v-model:page-size="queryParams.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="fetchList"
        @current-change="fetchList"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="(isEdit ? '编辑' : '新增') + entityName" width="560px" draggable destroy-on-close class="sku-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <slot name="form" :form="form" :isEdit="isEdit"></slot>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ isEdit ? '保存修改' : '确认新增' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* Same styling as Relation for consistency */
.mdm-container { padding: 20px; background: #f8fafc; min-height: calc(100vh - 60px); }
.page-header { display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 12px; padding: 18px 24px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.page-title { display: flex; align-items: center; gap: 12px; }
.title-icon { font-size: 28px; }
.page-title h2 { font-size: 17px; font-weight: 700; color: #1e293b; margin: 0 0 2px; }
.subtitle { font-size: 12px; color: #94a3b8; margin: 0; }
.filter-bar { background: #fff; border-radius: 12px; padding: 14px 20px 2px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.sku-table { border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.pagination-wrapper { display: flex; justify-content: flex-end; background: #fff; border-radius: 0 0 12px 12px; padding: 12px 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.sku-dialog :deep(.el-dialog__header) { background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px 12px 0 0; }
.sku-dialog :deep(.el-dialog__title) { color: #fff; font-weight: 600; }
.sku-dialog :deep(.el-dialog__headerbtn .el-dialog__close) { color: rgba(255,255,255,.8); }
</style>
