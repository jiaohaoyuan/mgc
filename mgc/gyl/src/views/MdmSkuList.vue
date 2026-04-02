<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Plus, Download, Search, Delete } from '@element-plus/icons-vue'
import axios from 'axios'

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const selectedIds = ref<number[]>([])

const queryParams = reactive({
  page: 1,
  pageSize: 20,
  keyword: ''
})

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/master/SKU/list', { params: queryParams })
    if (res.data.code === 200) {
      tableData.value = res.data.data.list
      total.value = res.data.data.total
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '获取数据失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.page = 1
  fetchList()
}

const handleSelectionChange = (selection: any[]) => {
  selectedIds.value = selection.map(row => row.id)
}

const handleBatchDelete = async () => {
  if (!selectedIds.value.length) {
    return ElMessage.warning('请选择要删除的数据')
  }
  try {
    await ElMessageBox.confirm('确认删除选中的数据吗？此操作为逻辑删除。', '提示', { type: 'warning' })
    const res = await axios.delete('/master/SKU', { data: { ids: selectedIds.value } })
    if (res.data.code === 200) {
      ElMessage.success('删除成功')
      fetchList()
    }
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 导入相关
const importDialogVisible = ref(false)
const fileList = ref<any[]>([])
const uploading = ref(false)
const importResult = ref<any>(null)

const handleImportSuccess = (response: any) => {
  uploading.value = false
  if (response.code === 200) {
    ElMessage.success('导入处理完成')
    importResult.value = response.data
    fetchList()
  } else {
    ElMessage.error(response.msg || '导入失败')
  }
}

const handleImportError = () => {
  uploading.value = false
  ElMessage.error('上传失败，请检查网络或服务')
}

const beforeUpload = (file: File) => {
  const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel'
  if (!isExcel && !file.name.endsWith('.xlsx')) {
    ElMessage.error('仅支持上传 .xlsx 格式文件!')
    return false
  }
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    ElMessage.error('上传文件大小不能超过 10MB!')
    return false
  }
  uploading.value = true
  return true
}

const handleDownloadTemplate = async () => {
  const xlsx = await import('xlsx')
  const ws = xlsx.utils.aoa_to_sheet([['SKU编码', 'SKU名称', '69码', '品类编码', '生命周期', '保质期', '单位换算', '规格体积']])
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Template')
  xlsx.writeFile(wb, 'SKU_Import_Template.xlsx')
}

const handleExport = async () => {
  if(!tableData.value.length) return ElMessage.warning('暂无数据可导出')
  const xlsx = await import('xlsx')
  const ws = xlsx.utils.json_to_sheet(tableData.value)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Export')
  xlsx.writeFile(wb, 'SKU_Export.xlsx')
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="mdm-container">
    <div class="page-header">
      <h2>SKU 主数据管理</h2>
      <div class="header-actions">
        <el-button type="success" :icon="UploadFilled" @click="importDialogVisible = true">批量导入</el-button>
        <el-button type="warning" :icon="Download" @click="handleExport">全量导出</el-button>
        <el-button type="danger" :icon="Delete" @click="handleBatchDelete" :disabled="!selectedIds.length">批量删除</el-button>
      </div>
    </div>

    <div class="table-toolbox">
      <el-form :inline="true" :model="queryParams" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="queryParams.keyword"
            placeholder="搜编码或名称"
            clearable
            style="width: 200px"
            :prefix-icon="Search"
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-table
      v-loading="loading"
      :data="tableData"
      border
      style="width: 100%; border-radius: 8px;"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column prop="sku_code" label="SKU 编码" width="150" />
      <el-table-column prop="sku_name" label="SKU 名称" min-width="180" />
      <el-table-column prop="bar_code" label="69码/国际码" width="150" />
      <el-table-column prop="category_code" label="品类编码" width="120" />
      <el-table-column prop="lifecycle_status" label="生命周期" width="100">
        <template #default="scope">
          <el-tag :type="scope.row.lifecycle_status === 'ACTIVE' ? 'success' : 'info'">
            {{ scope.row.lifecycle_status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="unit_ratio" label="单位换算" width="100" align="right" />
      <el-table-column prop="updated_time" label="更新时间" width="180" />
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="queryParams.page"
        v-model:page-size="queryParams.pageSize"
        :page-sizes="[20, 50, 100, 500]"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="fetchList"
        @current-change="fetchList"
      />
    </div>

    <!-- 导入弹窗 -->
    <el-dialog v-model="importDialogVisible" title="SKU 批量导入 (Upsert)" width="600px" @closed="importResult = null; fileList = []">
      <div v-show="!importResult">
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between;">
          <span style="color: #64748b; font-size: 14px;">支持最大 10,000 行，遇到已有编码自动覆盖更新。</span>
          <el-button type="primary" link @click="handleDownloadTemplate">下载模板</el-button>
        </div>
        <el-upload
          drag
          action="http://localhost:3000/api/master/import"
          :headers="{ Authorization: 'Bearer ' + (localStorage.getItem('accessToken') || '') }"
          :data="{ tableType: 'SKU' }"
          :before-upload="beforeUpload"
          :on-success="handleImportSuccess"
          :on-error="handleImportError"
          v-model:file-list="fileList"
          accept=".xlsx"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">只能上传 .xlsx 文件，且单次不超过 10MB</div>
          </template>
        </el-upload>
      </div>

      <!-- 导入结果展示 -->
      <div v-if="importResult">
        <el-alert title="处理结束" type="success" :closable="false" show-icon />
        <ul style="margin-top:20px; font-size:14px; color:#334155;">
          <li>总处理行数: <b>{{ importResult.totalCount }}</b></li>
          <li>成功更新/新增: <b style="color:#10b981">{{ importResult.successCount }}</b></li>
          <li>失败跳过行数: <b style="color:#ef4444">{{ importResult.errorCount }}</b></li>
        </ul>
        
        <div v-if="importResult.errors && importResult.errors.length > 0" style="margin-top: 20px">
          <p style="color:#ef4444; font-weight: bold; margin-bottom: 8px;">失败详情：</p>
          <el-table :data="importResult.errors" border max-height="250" style="width: 100%">
            <el-table-column prop="rowNumber" label="Excel行号" width="100" align="center" />
            <el-table-column prop="error" label="失败原因" />
          </el-table>
        </div>
      </div>

    </el-dialog>
  </div>
</template>

<style scoped>
.mdm-container {
  padding: 24px;
  background-color: white;
  min-height: calc(100vh - 60px);
  border-radius: 8px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}
.table-toolbox {
  margin-bottom: 16px;
}
.pagination-wrapper {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
