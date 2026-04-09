<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  UploadFilled, Plus, Download, Search, Delete, Edit,
  RefreshLeft, DocumentAdd, Link
} from '@element-plus/icons-vue'
import axios from 'axios'

// 状态
const loading = ref(false)
const tableData = ref<any[]>([])
const total = ref(0)
const selectedRows = ref<any[]>([])

const queryParams = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  region: '',
  channelType: '',
  validity: ''
})

// 列表查询
const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/master/RESELLER_RLTN/list', { params: queryParams })
    if (res.data.code === 200) {
      tableData.value = res.data.data.list
      total.value = res.data.data.total
    } else {
      ElMessage.error(res.data.msg || '获取数据失败')
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '网络错误，获取数据失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { queryParams.page = 1; fetchList() }

const handleReset = () => {
  Object.assign(queryParams, { keyword: '', region: '', channelType: '', validity: '', page: 1 })
  fetchList()
}

const handleSelectionChange = (sel: any[]) => { selectedRows.value = sel }
const selectedIds = computed(() => selectedRows.value.map(r => r.id))
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`
}))

// 切换页码时自动清除勾选（避免跨页操作混乱）
watch(() => queryParams.page, () => { selectedRows.value = [] })

// 新增/编辑弹窗
const dialogVisible = ref(false)
const dialogTitle = ref('新增授权关系')
const formRef = ref()
const isEdit = ref(false)
const editId = ref<number | null>(null)

const form = reactive({
  sku_code: '',
  reseller_code: '',
  reseller_name: '',
  region: '',
  channel_type: 'DIST',
  begin_date: '',
  end_date: '',
  price_grade: 'A',
  quota_cases: null as number | null
})

const formRules = {
  sku_code: [{ required: true, message: '请输入SKU编码', trigger: 'blur' }],
  reseller_code: [{ required: true, message: '请输入经销商编码', trigger: 'blur' }],
  begin_date: [{ required: true, message: '请选择生效开始日期', trigger: 'change' }],
  end_date: [{ required: true, message: '请选择授权到期日期', trigger: 'change' }]
}

const openAdd = () => {
  isEdit.value = false
  editId.value = null
  dialogTitle.value = '新增授权关系'
  Object.assign(form, {
    sku_code: '', reseller_code: '', reseller_name: '',
    region: '', channel_type: 'DIST', begin_date: '', end_date: '',
    price_grade: 'A', quota_cases: null
  })
  dialogVisible.value = true
}

const openEdit = (row: any) => {
  isEdit.value = true
  editId.value = row.id
  dialogTitle.value = '编辑授权关系'
  const fmt = (d: any) => d ? String(d).split('T')[0] : ''
  Object.assign(form, {
    sku_code: row.sku_code,
    reseller_code: row.reseller_code,
    reseller_name: row.reseller_name || '',
    region: row.region || '',
    channel_type: row.channel_type || 'DIST',
    begin_date: fmt(row.begin_date),
    end_date: fmt(row.end_date),
    price_grade: row.price_grade || 'A',
    quota_cases: row.quota_cases ?? null
  })
  dialogVisible.value = true
}

const submitForm = async () => {
  // 先校验表单，失败则直接返回，避免抛出未处理异常
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    let res
    if (isEdit.value) {
      res = await axios.put(`/master/RESELLER_RLTN/${editId.value}`, form)
    } else {
      res = await axios.post('/master/RESELLER_RLTN', form)
    }
    if (res.data.code === 200) {
      ElMessage.success(isEdit.value ? '编辑成功' : '新增成功')
      dialogVisible.value = false
      fetchList()
    } else {
      ElMessage.error(res.data.msg || '操作失败')
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '操作失败')
  }
}

// 单条撤销
const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确认撤销【${row.sku_code}】对【${row.reseller_name || row.reseller_code}】的授权吗？此操作为逻辑删除。`,
      '撤销授权确认',
      { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' }
    )
    const res = await axios.delete(`/master/RESELLER_RLTN/${row.id}`)
    if (res.data.code === 200) {
      ElMessage.success('撤销成功')
      fetchList()
    } else {
      ElMessage.error(res.data.msg || '撤销失败')
    }
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e.response?.data?.msg || '撤销失败')
    }
  }
}

// 批量撤销（逻辑删除）
const handleBatchDelete = async () => {
  if (!selectedIds.value.length) return ElMessage.warning('请先勾选要撤销的授权关系')
  try {
    await ElMessageBox.confirm(
      `确认批量撤销选中的 ${selectedIds.value.length} 条授权关系吗？此操作为逻辑删除，可恢复。`,
      '批量撤销确认',
      { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' }
    )
    const res = await axios.delete('/master/RESELLER_RLTN/batch', { data: { ids: selectedIds.value } })
    if (res.data.code === 200) {
      ElMessage.success(res.data.msg || '批量撤销成功')
      selectedRows.value = []
      fetchList()
    } else {
      ElMessage.error(res.data.msg || '批量撤销失败')
    }
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e.response?.data?.msg || '批量撤销失败')
    }
  }
}

// 导入相关
const importDialogVisible = ref(false)
const fileList = ref<any[]>([])
const uploading = ref(false)
const importResult = ref<any>(null)

const beforeUpload = (file: File) => {
  const isExcel =
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.name.endsWith('.xlsx')
  if (!isExcel) {
    ElMessage.error('仅支持上传 .xlsx 格式文件')
    return false
  }
  if (file.size / 1024 / 1024 > 10) {
    ElMessage.error('文件大小不能超过 10MB')
    return false
  }
  uploading.value = true
  return true
}

const handleImportSuccess = (response: any) => {
  uploading.value = false
  if (response.code === 200) {
    importResult.value = response.data
    ElMessage.success('导入处理完成')
    fetchList()
  } else {
    ElMessage.error(response.msg || '导入失败')
  }
}

const handleImportError = () => {
  uploading.value = false
  ElMessage.error('上传失败，请检查网络或服务')
}

const handleDownloadTemplate = async () => {
  const xlsx = await import('xlsx')
  const headers = [['SKU编码', '经销商编码', '经销商名称', '所属大区', '渠道类型', '生效开始日期', '生效结束日期', '价格等级', '月度配额(箱)']]
  const example = [['SKU-P001', 'DIST-苏州', '苏州联华牧业贸易有限公司', '华东', 'DIST', '2025-01-01', '2026-12-31', 'A', '2000']]
  const ws = xlsx.utils.aoa_to_sheet([...headers, ...example])
  ws['!cols'] = Array(9).fill({ wch: 20 })
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, '经销关系导入模板')
  xlsx.writeFile(wb, '经销关系授权_导入模板.xlsx')
}

// 导出（按当前筛选条件）
const handleExport = async () => {
  try {
    const res = await axios.get('/master/RESELLER_RLTN/export', {
      params: {
        keyword: queryParams.keyword,
        region: queryParams.region,
        channelType: queryParams.channelType,
        validity: queryParams.validity
      }
    })
    const payload = res.data?.data
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.list) ? payload.list : [])
    const taskId = Array.isArray(payload) ? null : payload?.taskId
    if (!rows.length) {
      return ElMessage.warning('当前筛选条件下暂无数据可导出')
    }
    const xlsx = await import('xlsx')
    const fmt = (d: any) => d ? String(d).split('T')[0] : ''
    const exportData = rows.map((r: any) => ({
      'SKU编码': r.sku_code,
      '经销商编码': r.reseller_code,
      '经销商名称': r.reseller_name,
      '所属大区': r.region,
      '渠道类型': r.channel_type,
      '生效开始日期': fmt(r.begin_date),
      '授权到期日期': fmt(r.end_date),
      '价格等级': r.price_grade,
      '月度配额(箱)': r.quota_cases,
      '创建时间': fmt(r.created_time),
      '更新时间': fmt(r.updated_time)
    }))
    const ws = xlsx.utils.json_to_sheet(exportData)
    ws['!cols'] = Array(11).fill({ wch: 20 })
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, '经销关系授权')
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
    xlsx.writeFile(wb, `经销关系授权_${ts}.xlsx`)
    ElMessage.success(taskId ? `成功导出 ${exportData.length} 条数据，任务ID: ${taskId}` : `成功导出 ${exportData.length} 条数据`)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '导出失败')
  }
}

// 工具函数
/** 日期格式化：只取日期部分，兼容 ISO 字符串 */
const fmtDate = (d: any) => d ? String(d).split('T')[0] : '-'

/**
 * 有效性判断：用字符串比较代替 new Date()，性能更好
 * yyyy-MM-dd 字符串的字典序与日期大小顺序一致，可直接比较
 */
const validityTag = (row: any) => {
  const todayStr = new Date().toISOString().slice(0, 10)
  const beginStr = fmtDate(row.begin_date)
  const endStr = fmtDate(row.end_date)
  if (!beginStr || beginStr === '-' || !endStr || endStr === '-') {
    return { type: 'info', label: '日期缺失' }
  }
  if (todayStr > endStr) return { type: 'danger', label: '已过期' }
  if (todayStr < beginStr) return { type: 'warning', label: '未生效' }
  return { type: 'success', label: '当前有效' }
}

const channelLabel = (c: string) => {
  const map: Record<string,string> = { DIST: '经销商', STORE: '门店', ONLINE: '线上电商' }
  return map[c] || c
}

const channelTagType = (c: string): any => {
  const map: Record<string, string> = { DIST: 'primary', STORE: 'success', ONLINE: 'warning' }
  return map[c] || 'info'
}

const regionColor: Record<string, string> = {
  '华东': '#3b82f6', '华南': '#10b981', '华北': '#8b5cf6',
  '华中': '#f59e0b', '华西': '#ef4444', '全国': '#6366f1'
}

onMounted(fetchList)
</script>


<template>
  <div class="mdm-container">
    <!-- 页头 -->
    <div class="page-header">
      <div class="page-title">
        <span class="title-icon">馃</span>
        <div>
          <h2>经销关系授权管理</h2>
          <p class="subtitle">Master Data Management 路 SKU × 经销商授权</p>
        </div>
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Plus" @click="openAdd" id="btn-add-rltn">新增授权</el-button>
        <el-button type="success" :icon="DocumentAdd" @click="importDialogVisible = true" id="btn-import-rltn">批量导入</el-button>
        <el-button type="warning" :icon="Download" @click="handleExport" id="btn-export-rltn">导出</el-button>
        <el-button
          type="danger"
          :icon="Delete"
          :disabled="!selectedIds.length"
          @click="handleBatchDelete"
          id="btn-batch-delete-rltn"
        >批量撤销 <span v-if="selectedIds.length">({{ selectedIds.length }})</span></el-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-form :inline="true" :model="queryParams" @submit.prevent="handleSearch" class="filter-form">
        <el-form-item label="关键字">
          <el-input
            v-model="queryParams.keyword"
            placeholder="SKU编码 / 经销商编码 / 名称"
            clearable
            style="width: 230px"
            :prefix-icon="Search"
            @clear="handleSearch"
            @keyup.enter="handleSearch"
            id="input-rltn-keyword"
          />
        </el-form-item>
        <el-form-item label="大区">
          <el-select v-model="queryParams.region" placeholder="全部大区" clearable style="width: 120px" @change="handleSearch" id="select-region">
            <el-option label="华东" value="华东" />
            <el-option label="华南" value="华南" />
            <el-option label="华北" value="华北" />
            <el-option label="华中" value="华中" />
            <el-option label="华西" value="华西" />
            <el-option label="全国" value="全国" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="queryParams.channelType" placeholder="全部渠道" clearable style="width: 130px" @change="handleSearch" id="select-channel">
            <el-option label="经销商" value="DIST" />
            <el-option label="门店" value="STORE" />
            <el-option label="线上电商" value="ONLINE" />
          </el-select>
        </el-form-item>
        <el-form-item label="有效性">
          <el-select v-model="queryParams.validity" placeholder="全部" clearable style="width: 120px" @change="handleSearch" id="select-validity">
            <el-option label="当前有效" value="valid" />
            <el-option label="已过期" value="expired" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch" id="btn-search-rltn">查询</el-button>
          <el-button :icon="RefreshLeft" @click="handleReset" id="btn-reset-rltn">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 已选提示 -->
    <div v-if="selectedIds.length" class="selection-bar">
      <el-icon><Link /></el-icon>
      已选择 <b>{{ selectedIds.length }}</b> 条授权关系 <el-button link type="primary" @click="selectedRows = []" style="margin-left:8px">清除</el-button>
    </div>

    <!-- 表格 -->
    <el-table
      v-loading="loading"
      :data="tableData"
      border
      stripe
      style="width: 100%"
      @selection-change="handleSelectionChange"
      class="rltn-table"
      id="rltn-main-table"
    >
      <el-table-column type="selection" width="46" align="center" fixed="left" />
      <el-table-column prop="sku_code" label="SKU 编码" width="130" fixed="left">
        <template #default="{ row }">
          <span class="code-text">{{ row.sku_code }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="reseller_code" label="经销商编码" width="150">
        <template #default="{ row }">
          <span class="code-text code-reseller">{{ row.reseller_code }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="reseller_name" label="经销商名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="region" label="大区" width="80" align="center">
        <template #default="{ row }">
          <span class="region-badge" :style="{ background: regionColor[row.region] || '#6b7280' }">
            {{ row.region || '-' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="channel_type" label="渠道" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="channelTagType(row.channel_type)" size="small" effect="light">
            {{ channelLabel(row.channel_type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="授权期间" width="210">
        <template #default="{ row }">
          <div class="date-range">
            <span class="date-begin">{{ fmtDate(row.begin_date) }}</span>
            <span class="date-sep">→</span>
            <span class="date-end">{{ fmtDate(row.end_date) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="有效性" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="validityTag(row).type as any" size="small" effect="dark">
            {{ validityTag(row).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="price_grade" label="价格等级" width="90" align="center">
        <template #default="{ row }">
          <el-tag
            :type="row.price_grade === 'A' ? 'success' : row.price_grade === 'B' ? 'warning' : 'info'"
            size="small"
          >{{ row.price_grade || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="quota_cases" label="月度配额(箱)" width="120" align="right">
        <template #default="{ row }">
          {{ row.quota_cases ? row.quota_cases.toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link :icon="Edit" @click="openEdit(row)" :id="`btn-edit-rltn-${row.id}`">编辑</el-button>
          <el-divider direction="vertical" />
          <el-button size="small" type="danger" link :icon="Delete" @click="handleDelete(row)" :id="`btn-delete-rltn-${row.id}`">撤销</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="queryParams.page"
        v-model:page-size="queryParams.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="fetchList"
        @current-change="fetchList"
        id="rltn-pagination"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="620px"
      draggable
      destroy-on-close
      :close-on-click-modal="false"
      class="rltn-dialog"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="110px"
        label-position="left"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="SKU编码" prop="sku_code">
              <el-input v-model="form.sku_code" :disabled="isEdit" placeholder="例如：SKU-P001" id="form-rltn-sku" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="经销商编码" prop="reseller_code">
              <el-input v-model="form.reseller_code" :disabled="isEdit" placeholder="例如：DIST-苏州" id="form-rltn-reseller" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="经销商名称">
          <el-input v-model="form.reseller_name" placeholder="如：苏州联华牧业贸易有限公司" id="form-rltn-name" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属大区">
              <el-select v-model="form.region" placeholder="请选择大区" style="width:100%" id="form-rltn-region">
                <el-option label="华东" value="华东" />
                <el-option label="华南" value="华南" />
                <el-option label="华北" value="华北" />
                <el-option label="华中" value="华中" />
                <el-option label="华西" value="华西" />
                <el-option label="全国" value="全国" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="渠道类型">
              <el-select v-model="form.channel_type" style="width:100%" id="form-rltn-channel">
                <el-option label="经销商 (DIST)" value="DIST" />
                <el-option label="门店 (STORE)" value="STORE" />
                <el-option label="线上电商 (ONLINE)" value="ONLINE" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="生效开始日期" prop="begin_date">
              <el-date-picker v-model="form.begin_date" type="date" value-format="YYYY-MM-DD" placeholder="选择开始日期" style="width:100%" id="form-rltn-begin" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="授权到期日期" prop="end_date">
              <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" placeholder="选择到期日期" style="width:100%" id="form-rltn-end" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="价格等级">
              <el-radio-group v-model="form.price_grade" id="form-rltn-grade">
                <el-radio-button label="A">A级</el-radio-button>
                <el-radio-button label="B">B级</el-radio-button>
                <el-radio-button label="C">C级</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="月度配额(箱)">
              <el-input-number v-model="form.quota_cases" :min="0" :max="999999" controls-position="right" style="width:100%" placeholder="不限" id="form-rltn-quota" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-alert v-if="isEdit" type="info" :closable="false" show-icon style="margin-top:4px">
          <template #default>编辑时 SKU 编码和经销商编码不可更改，如需变更请删除后重新授权。</template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" id="btn-rltn-submit">
          {{ isEdit ? '保存修改' : '确认授权' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Excel 导入弹窗 -->
    <el-dialog
      v-model="importDialogVisible"
      title="经销关系授权 批量导入"
      width="620px"
      draggable
      @closed="importResult = null; fileList = []"
      class="rltn-dialog"
    >
      <div v-if="!importResult">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
          <template #default>
            自动识别已存在的 (SKU + 经销商) 组合并覆盖更新日期；新组合直接新增。<el-button link type="primary" @click="handleDownloadTemplate" style="margin-left:8px" id="btn-rltn-template">下载模板</el-button>
          </template>
        </el-alert>
        <el-upload
          drag
          action="http://localhost:3000/api/master/import"
          :headers="uploadHeaders"
          :data="{ tableType: 'RESELLER_RLTN' }"
          :before-upload="beforeUpload"
          :on-success="handleImportSuccess"
          :on-error="handleImportError"
          v-model:file-list="fileList"
          accept=".xlsx"
          :multiple="false"
          id="upload-rltn-excel"
        >
          <el-icon class="el-icon--upload" style="font-size:48px; color:#409eff;"><upload-filled /></el-icon>
          <div class="el-upload__text">拖拽 .xlsx 到此处，或 <em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">日期格式 YYYY-MM-DD，最多 10,000 行，不超过 10MB</div>
          </template>
        </el-upload>
      </div>

      <div v-else>
        <el-alert title="导入处理完成" type="success" :closable="false" show-icon style="margin-bottom:16px" />
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="总处理">{{ importResult.totalCount }}</el-descriptions-item>
          <el-descriptions-item label="成功">
            <span style="color:#10b981;font-weight:700">{{ importResult.successCount }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="失败">
            <span style="color:#ef4444;font-weight:700">{{ importResult.errorCount }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="importResult.errors?.length > 0" style="margin-top:16px">
          <p style="color:#ef4444;font-weight:600;margin-bottom:8px">失败明细：</p>
          <el-table :data="importResult.errors" border max-height="220" size="small">
            <el-table-column prop="rowNumber" label="Excel行号" width="90" align="center" />
            <el-table-column prop="error" label="失败原因" />
          </el-table>
        </div>
        <div style="margin-top:16px;text-align:right">
          <el-button @click="importResult = null; fileList = []">继续导入</el-button>
          <el-button type="primary" @click="importDialogVisible = false">关闭</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.mdm-container {
  padding: 24px;
  background: #f8fafc;
  min-height: calc(100vh - 60px);
}

/* 页头 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.page-title {
  display: flex;
  align-items: center;
  gap: 14px;
}
.title-icon {
  font-size: 32px;
}
.page-title h2 {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 2px;
}
.subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 筛选栏 */
.filter-bar {
  background: #fff;
  border-radius: 12px;
  padding: 16px 24px 4px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}

/* 已选 */
.selection-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 8px 16px;
  color: #c2410c;
  font-size: 14px;
  margin-bottom: 12px;
}

/* 表格 */
.rltn-table {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}

.code-text {
  font-family: 'JetBrains Mono','Courier New', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #0f6cbd;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
}
.code-reseller {
  color: #059669;
  background: #ecfdf5;
}

.region-badge {
  display: inline-block;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
  letter-spacing: 1px;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.date-begin { color: #374151; }
.date-sep { color: #9ca3af; }
.date-end { color: #374151; }

/* 分页 */
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  background: #fff;
  border-radius: 0 0 12px 12px;
  padding: 12px 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
  margin-top: -1px;
}

/* 弹窗 */
.rltn-dialog :deep(.el-dialog__header) {
  background: linear-gradient(135deg, #059669 0%, #0d9488 100%);
  border-radius: 12px 12px 0 0;
  padding: 16px 20px;
}
.rltn-dialog :deep(.el-dialog__title) {
  color: #fff;
  font-weight: 600;
}
.rltn-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: rgba(255,255,255,.8);
}
.rltn-dialog :deep(.el-dialog) {
  border-radius: 12px;
}
</style>

