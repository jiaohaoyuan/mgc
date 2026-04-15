<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  UploadFilled, Plus, Download, Search, Delete, Edit,
  RefreshLeft, Check, CircleClose, DocumentAdd, ArrowDown, Loading, Tickets
} from '@element-plus/icons-vue'
import axios from 'axios'
import {
  SKU_SPEC_EXECUTION_SUMMARY,
  SKU_SPEC_EXAMPLE,
  SKU_SPEC_FORMAT,
  skuSpecCompatibilityPolicy,
  skuSpecDictionarySections as skuSpecDictionarySectionsFallback,
  skuSpecDictionaryTypes,
  skuSpecImplementedItems,
  skuSpecNextSteps,
  skuSpecSegments,
  skuSpecSystemChanges,
  skuSpecTemplateSheets,
  skuSpecUsageGuides,
  skuSpecValidationSections
} from '@/data/skuSpec'

const SKU_CODE_REGEX = /^SKU-[A-Z]{3}-[A-Z]{3}-(?:\d+ML|\d+L|\d+G|\d+KG)-\d{2}[A-Z]{2}-[A-Z0-9]{3}-\d{3}$/
const DEFAULT_SKU_EXAMPLE = 'SKU-UHT-UHT-250ML-12BX-PLN-001'

// 状态
const loading = ref(false)
const tableData = ref<any[]>([])
const total = ref(0)
const selectedRows = ref<any[]>([])

const queryParams = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  lifecycleStatus: ''
})

const skuRuleConfig = ref<any>(null)
const skuSpecVisible = ref(false)

// 主数据查询
const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/master/SKU/list', { params: queryParams })
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

const fetchSkuRuleConfig = async () => {
  try {
    const res = await axios.get('/master/SKU/rule-config')
    if (res.data.code === 200) {
      skuRuleConfig.value = res.data.data
    }
  } catch {
    skuRuleConfig.value = null
  }
}

const handleSearch = () => {
  queryParams.page = 1
  fetchList()
}

const handleReset = () => {
  queryParams.keyword = ''
  queryParams.lifecycleStatus = ''
  queryParams.page = 1
  fetchList()
}

const handleSelectionChange = (selection: any[]) => {
  selectedRows.value = selection
}

const selectedIds = computed(() => selectedRows.value.map(r => r.id))
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`
}))

// 切换页码时自动清除勾选
watch(() => queryParams.page, () => { selectedRows.value = [] })

// 新增/编辑弹窗
const dialogVisible = ref(false)
const dialogTitle = ref('新增 SKU')
const formRef = ref()
const isEdit = ref(false)
const editId = ref<number | null>(null)

const form = reactive({
  sku_code: '',
  sku_name: '',
  bar_code: '',
  category_code: '',
  lifecycle_status: 'ACTIVE',
  shelf_life_days: 0,
  unit_ratio: 1,
  volume_m3: 0
})

const skuCodeExample = computed(() => skuRuleConfig.value?.example?.sku_code || DEFAULT_SKU_EXAMPLE)
const skuRuleFormatText = computed(() => skuRuleConfig.value?.format || 'SKU-品类码-工艺码-规格码-包装码-属性码-流水号')
const isLegacyEditCode = computed(() => isEdit.value && !!form.sku_code && !SKU_CODE_REGEX.test(String(form.sku_code).trim().toUpperCase()))
const skuSpecExample = computed(() => skuRuleConfig.value?.example?.sku_code || SKU_SPEC_EXAMPLE)
const skuSpecFormat = computed(() => skuRuleConfig.value?.format || SKU_SPEC_FORMAT)
const skuSpecDictionarySections = computed(() => {
  const remoteSections = skuRuleConfig.value?.dictSections
  if (!Array.isArray(remoteSections) || !remoteSections.length) {
    return skuSpecDictionarySectionsFallback
  }
  const fallbackMap = new Map(skuSpecDictionarySectionsFallback.map(section => [section.dictType, section]))
  const normalized = remoteSections
    .map((section: any) => {
      const fallback = fallbackMap.get(section.dictType)
      const items = Array.isArray(section.items)
        ? section.items
          .map((item: any) => ({
            code: String(item.code || '').trim(),
            name: String(item.name || '').trim()
          }))
          .filter((item: any) => item.code && item.name)
        : fallback?.items || []
      return {
        title: fallback?.title || section.dictTypeName || section.dictType || 'SKU字典',
        dictType: section.dictType || fallback?.dictType || '',
        dictTypeName: section.dictTypeName || fallback?.dictTypeName || '',
        segment: section.segment || fallback?.segment || '',
        items
      }
    })
    .filter((section: any) => section.dictType)
  const existingTypes = new Set(normalized.map((section: any) => section.dictType))
  const missing = skuSpecDictionarySectionsFallback.filter(section => !existingTypes.has(section.dictType))
  return [...normalized, ...missing]
})

const validateSkuCodeRule = (_rule: any, value: string, callback: (error?: Error) => void) => {
  if (isEdit.value) return callback()
  const code = String(value || '').trim().toUpperCase()
  if (!code) return callback(new Error('请输入SKU编码'))
  if (!SKU_CODE_REGEX.test(code)) {
    return callback(new Error(`SKU编码需符合七段式规则，例如：${skuCodeExample.value}`))
  }
  callback()
}

const formRules = {
  sku_code: [
    { required: true, message: '请输入SKU编码', trigger: 'blur' },
    { validator: validateSkuCodeRule, trigger: 'blur' }
  ],
  sku_name: [{ required: true, message: '请输入SKU名称', trigger: 'blur' }],
  lifecycle_status: [{ required: true, message: '请选择生命周期', trigger: 'change' }]
}

const openAdd = () => {
  isEdit.value = false
  editId.value = null
  dialogTitle.value = '新增 SKU'
  Object.assign(form, {
    sku_code: '', sku_name: '', bar_code: '', category_code: '',
    lifecycle_status: 'ACTIVE', shelf_life_days: 0, unit_ratio: 1, volume_m3: 0
  })
  dialogVisible.value = true
}

const openEdit = (row: any) => {
  isEdit.value = true
  editId.value = row.id
  dialogTitle.value = '编辑 SKU'
  Object.assign(form, {
    sku_code: row.sku_code,
    sku_name: row.sku_name,
    bar_code: row.bar_code || '',
    category_code: row.category_code || '',
    lifecycle_status: row.lifecycle_status || 'ACTIVE',
    shelf_life_days: row.shelf_life_days || 0,
    unit_ratio: row.unit_ratio || 1,
    volume_m3: row.volume_m3 || 0
  })
  dialogVisible.value = true
}

const submitForm = async () => {
  // 校验表单，失败则直接返回，避免未处理的 Promise 异常
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload = {
      ...form,
      sku_code: String(form.sku_code || '').trim().toUpperCase(),
      sku_name: String(form.sku_name || '').trim(),
      bar_code: String(form.bar_code || '').trim(),
      category_code: String(form.category_code || '').trim(),
      lifecycle_status: String(form.lifecycle_status || 'ACTIVE').trim().toUpperCase()
    }
    let res
    if (isEdit.value) {
      res = await axios.put(`/master/SKU/${editId.value}`, payload)
    } else {
      res = await axios.post('/master/SKU', payload)
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

// 单条删除
const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确认删除 SKU【${row.sku_name}】吗？此操作为逻辑删除，数据可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    const res = await axios.delete(`/master/SKU/${row.id}`)
    if (res.data.code === 200) {
      ElMessage.success('删除成功')
      fetchList()
    } else {
      ElMessage.error(res.data.msg || '删除失败')
    }
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e.response?.data?.msg || '删除失败')
    }
  }
}

// 批量删除
const handleBatchDelete = async () => {
  if (!selectedIds.value.length) return ElMessage.warning('请先勾选要删除的数据')
  try {
    await ElMessageBox.confirm(
      `确认批量删除选中的 ${selectedIds.value.length} 条 SKU 吗？此操作为逻辑删除，可恢复。`,
      '批量删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    const res = await axios.delete('/master/SKU/batch', { data: { ids: selectedIds.value } })
    if (res.data.code === 200) {
      ElMessage.success(res.data.msg || '批量删除成功')
      selectedRows.value = []
      fetchList()
    } else {
      ElMessage.error(res.data.msg || '批量删除失败')
    }
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e.response?.data?.msg || '批量删除失败')
    }
  }
}

// 批量启用 / 停用
const handleBatchStatus = async (targetStatus: 'ACTIVE' | 'INACTIVE') => {
  if (!selectedIds.value.length) return ElMessage.warning('请先勾选要操作的数据')
  const label = targetStatus === 'ACTIVE' ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(
      `确认将选中的 ${selectedIds.value.length} 条 SKU 批量设为【${label}】状态吗？`,
      `批量${label}确认`,
      { type: 'warning', confirmButtonText: `确认${label}`, cancelButtonText: '取消' }
    )
    const res = await axios.patch('/master/SKU/batch-status', {
      ids: selectedIds.value,
      lifecycleStatus: targetStatus
    })
    if (res.data.code === 200) {
      ElMessage.success(`批量${label}成功`)
      selectedRows.value = []
      fetchList()
    } else {
      ElMessage.error(res.data.msg || `批量${label}失败`)
    }
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e.response?.data?.msg || `批量${label}失败`)
    }
  }
}

// 批量操作统一分发（dropdown @command handler）
const handleBatchCommand = (command: string) => {
  if (command === 'ACTIVE' || command === 'INACTIVE') {
    handleBatchStatus(command)
  } else if (command === 'DELETE') {
    handleBatchDelete()
  }
}

// Excel 导入
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

const handleDownloadTemplate = async () => {
  const xlsx = await import('xlsx')
  let ruleConfig = skuRuleConfig.value
  if (!ruleConfig) {
    try {
      const res = await axios.get('/master/SKU/rule-config')
      if (res.data.code === 200) {
        ruleConfig = res.data.data
        skuRuleConfig.value = res.data.data
      }
    } catch {
      ruleConfig = null
    }
  }
  const example = ruleConfig?.example || {
    sku_code: DEFAULT_SKU_EXAMPLE,
    sku_name: '常温纯牛奶250ml×12盒',
    bar_code: '6900000000001',
    category_code: 'CAT-L3-UHT',
    lifecycle_status: 'ACTIVE',
    shelf_life_days: 180,
    unit_ratio: 12,
    volume_m3: 0.014
  }
  const headers = [['SKU编码', 'SKU名称', '69码', '品类编码', '生命周期', '保质期(天)', '单位换算', '规格体积(m³)']]
  const exampleRows = [[
    example.sku_code,
    example.sku_name,
    example.bar_code,
    example.category_code,
    example.lifecycle_status,
    String(example.shelf_life_days),
    String(example.unit_ratio),
    String(example.volume_m3)
  ]]
  const ws = xlsx.utils.aoa_to_sheet([...headers, ...exampleRows])
  ws['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }]
  const ruleRows = [
    ['项目', '内容'],
    ['编码格式', ruleConfig?.format || 'SKU-品类码-工艺码-规格码-包装码-属性码-流水号'],
    ['示例编码', example.sku_code],
    ['规则1', '固定7段：SKU-品类码-工艺码-规格码-包装码-属性码-流水号'],
    ['规则2', '规格码必须带单位，只允许 ML、L、G、KG'],
    ['规则3', '包装码为两位数量加两位包装类型，例如 12BX、10CP、01CN'],
    ['规则4', '属性码只保留一个主属性码'],
    ['规则5', '流水号固定3位数字，例如 001'],
    ['兼容说明', '已有历史SKU可按原编码覆盖更新；新增SKU必须符合七段式标准']
  ]
  const ruleSheet = xlsx.utils.aoa_to_sheet(ruleRows)
  ruleSheet['!cols'] = [{ wch: 16 }, { wch: 80 }]
  const dictRows = [['字典类型', '段位', '编码', '名称', '说明']]
  ;(ruleConfig?.dictSections || []).forEach((section: any) => {
    ;(section.items || []).forEach((item: any) => {
      dictRows.push([section.dictTypeName, section.segment, item.code, item.name, item.remark || ''])
    })
  })
  const dictSheet = xlsx.utils.aoa_to_sheet(dictRows)
  dictSheet['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 30 }]
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'SKU导入模板')
  xlsx.utils.book_append_sheet(wb, ruleSheet, '编码规则')
  xlsx.utils.book_append_sheet(wb, dictSheet, '编码字典')
  xlsx.writeFile(wb, 'SKU_导入模板.xlsx')
}

// Excel 导出（按当前筛选条件）
const handleExport = async () => {
  try {
    const res = await axios.get('/master/SKU/export', {
      params: { keyword: queryParams.keyword, lifecycleStatus: queryParams.lifecycleStatus }
    })
    const payload = res.data?.data
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.list) ? payload.list : [])
    const taskId = Array.isArray(payload) ? null : payload?.taskId
    if (!rows.length) {
      return ElMessage.warning('当前筛选条件下暂无数据可导出')
    }
    const xlsx = await import('xlsx')
    const exportData = rows.map((r: any) => ({
      'SKU编码': r.sku_code,
      'SKU名称': r.sku_name,
      '69码/国际码': r.bar_code,
      '品类编码': r.category_code,
      '生命周期': r.lifecycle_status,
      '保质期(天)': r.shelf_life_days,
      '单位换算': r.unit_ratio,
      '规格体积(m³)': r.volume_m3,
      '创建时间': r.created_time,
      '更新时间': r.updated_time
    }))
    const ws = xlsx.utils.json_to_sheet(exportData)
    ws['!cols'] = [
      { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
      { wch: 22 }, { wch: 22 }
    ]
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'SKU主数据')
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    xlsx.writeFile(wb, `SKU主数据导出_${ts}.xlsx`)
    ElMessage.success(taskId ? `成功导出 ${exportData.length} 条数据，任务ID: ${taskId}` : `成功导出 ${exportData.length} 条数据`)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '导出失败')
  }
}

// 工具
const lifecycleTagType = (status: string) => {
  const map: Record<string, string> = { ACTIVE: 'success', INACTIVE: 'warning', OBSOLETE: 'info' }
  return (map[status] || 'info') as any
}
const lifecycleLabel = (status: string) => {
  const map: Record<string, string> = { ACTIVE: '在售', INACTIVE: '停用', OBSOLETE: '下市' }
  return map[status] || status
}

onMounted(() => {
  fetchList()
  fetchSkuRuleConfig()
})
</script>

<template>
  <div class="mdm-container">
    <!-- 页头 -->
    <div class="page-header">
      <div class="page-title">
        <span class="title-icon">SKU</span>
        <div>
          <h2>SKU 主数据管理</h2>
          <p class="subtitle">Master Data Management 路 SKU</p>
        </div>
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Plus" @click="openAdd" id="btn-add-sku">新增</el-button>
        <el-button type="success" :icon="DocumentAdd" @click="importDialogVisible = true" id="btn-import-sku">Excel 导入</el-button>
        <el-button type="warning" :icon="Download" @click="handleExport" id="btn-export-sku">导出</el-button>
        <el-button :icon="Tickets" @click="skuSpecVisible = true" id="btn-view-sku-spec">查看SKU制定规范</el-button>
        <el-dropdown trigger="click" :disabled="!selectedIds.length" @command="handleBatchCommand">
          <el-button type="info" :disabled="!selectedIds.length" id="btn-batch-ops">
            批量操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="ACTIVE" :icon="Check">批量启用</el-dropdown-item>
              <el-dropdown-item command="INACTIVE" :icon="CircleClose">批量停用</el-dropdown-item>
              <el-dropdown-item command="DELETE" divided :icon="Delete">批量删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-form :inline="true" :model="queryParams" @submit.prevent="handleSearch" class="filter-form">
        <el-form-item label="关键字">
          <el-input
            v-model="queryParams.keyword"
            placeholder="搜索 SKU 编码 / 名称"
            clearable
            style="width: 220px"
            :prefix-icon="Search"
            @clear="handleSearch"
            @keyup.enter="handleSearch"
            id="input-sku-keyword"
          />
        </el-form-item>
        <el-form-item label="生命周期">
          <el-select
            v-model="queryParams.lifecycleStatus"
            placeholder="全部"
            clearable
            style="width: 130px"
            @change="handleSearch"
            id="select-lifecycle"
          >
            <el-option label="在售 (ACTIVE)" value="ACTIVE" />
            <el-option label="停用 (INACTIVE)" value="INACTIVE" />
            <el-option label="下市 (OBSOLETE)" value="OBSOLETE" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch" id="btn-search">查询</el-button>
          <el-button :icon="RefreshLeft" @click="handleReset" id="btn-reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 已选提示 -->
    <div v-if="selectedIds.length" class="selection-bar">
      <el-icon><Check /></el-icon>
      已选择 <b>{{ selectedIds.length }}</b> 条数据 <el-button link type="primary" @click="selectedRows = []" style="margin-left:8px">清除选择</el-button>
    </div>

    <!-- 表格 -->
    <el-table
      v-loading="loading"
      :data="tableData"
      border
      stripe
      style="width: 100%"
      @selection-change="handleSelectionChange"
      class="sku-table"
      id="sku-main-table"
    >
      <el-table-column type="selection" width="46" align="center" fixed="left" />
      <el-table-column prop="sku_code" label="SKU 编码" width="150" fixed="left">
        <template #default="{ row }">
          <span class="code-text">{{ row.sku_code }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="sku_name" label="SKU 名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="bar_code" label="69码/国际码" width="150" />
      <el-table-column prop="category_code" label="品类编码" width="120" />
      <el-table-column prop="lifecycle_status" label="生命周期" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="lifecycleTagType(row.lifecycle_status)" size="small" effect="light">
            {{ lifecycleLabel(row.lifecycle_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="shelf_life_days" label="保质期(天)" width="100" align="right" />
      <el-table-column prop="unit_ratio" label="单位换算" width="100" align="right">
        <template #default="{ row }">
          {{ Number(row.unit_ratio).toFixed(0) }}
        </template>
      </el-table-column>
      <el-table-column prop="volume_m3" label="规格体积(m³)" width="120" align="right">
        <template #default="{ row }">
          {{ Number(row.volume_m3).toFixed(4) }}
        </template>
      </el-table-column>
      <el-table-column prop="updated_time" label="更新时间" width="170">
        <template #default="{ row }">
          {{ row.updated_time ? String(row.updated_time).substring(0, 19) : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            link
            :icon="Edit"
            @click="openEdit(row)"
            :id="`btn-edit-${row.id}`"
          >编辑</el-button>
          <el-divider direction="vertical" />
          <el-button
            size="small"
            type="danger"
            link
            :icon="Delete"
            @click="handleDelete(row)"
            :id="`btn-delete-${row.id}`"
          >删除</el-button>
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
        id="sku-pagination"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      draggable
      destroy-on-close
      :close-on-click-modal="false"
      class="sku-dialog"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
        label-position="left"
      >
        <el-form-item label="SKU编码" prop="sku_code">
          <el-input v-model="form.sku_code" :disabled="isEdit" :placeholder="`例如：${skuCodeExample}`" id="form-sku-code" />
          <div v-if="!isEdit" class="form-hint">七段式规则：{{ skuRuleFormatText }}</div>
          <div v-else-if="isLegacyEditCode" class="form-hint">当前为历史SKU编码，可继续维护，但新增SKU必须使用七段式标准编码</div>
          <div v-else class="form-hint">编辑时 SKU 编码不可更改</div>
        </el-form-item>
        <el-form-item label="SKU名称" prop="sku_name">
          <el-input v-model="form.sku_name" placeholder="例如：认养一头牛 全脂纯牛奶200ml×12盒" id="form-sku-name" />
        </el-form-item>
        <el-form-item label="69码">
          <el-input v-model="form.bar_code" placeholder="国际条形码（可选）" id="form-bar-code" />
        </el-form-item>
        <el-form-item label="品类编码">
          <el-input v-model="form.category_code" placeholder="例如：MILK-FRESH（可选）" id="form-category-code" />
        </el-form-item>
        <el-form-item label="生命周期" prop="lifecycle_status">
          <el-select v-model="form.lifecycle_status" style="width: 100%" id="form-lifecycle-status">
            <el-option label="在售 (ACTIVE)" value="ACTIVE" />
            <el-option label="停用 (INACTIVE)" value="INACTIVE" />
            <el-option label="下市 (OBSOLETE)" value="OBSOLETE" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="保质期(天)">
              <el-input-number v-model="form.shelf_life_days" :min="0" :max="9999" controls-position="right" style="width:100%" id="form-shelf-life" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位换算">
              <el-input-number v-model="form.unit_ratio" :min="1" :max="9999" controls-position="right" style="width:100%" id="form-unit-ratio" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="规格体积(m³)">
          <el-input-number v-model="form.volume_m3" :min="0" :precision="6" :step="0.001" controls-position="right" style="width:100%" id="form-volume" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" id="btn-dialog-submit">
          {{ isEdit ? '保存修改' : '确认新增' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 鈺愨晲 Excel 导入弹窗 鈺愨晲 -->
    <el-dialog
      v-model="importDialogVisible"
      title="SKU 批量导入 (Upsert)"
      width="620px"
      draggable
      @closed="importResult = null; fileList = []"
      class="sku-dialog"
    >
      <div v-if="!importResult">
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
          <template #default>
            支持最多 <b>10,000</b> 行；新增SKU必须符合七段式编码，已有SKU编码可覆盖更新。<el-button link type="primary" @click="handleDownloadTemplate" style="margin-left:8px" id="btn-download-template">
              下载导入模板
            </el-button>
          </template>
        </el-alert>
        <el-upload
          drag
          action="http://localhost:3000/api/master/import"
          :headers="uploadHeaders"
          :data="{ tableType: 'SKU' }"
          :before-upload="beforeUpload"
          :on-success="handleImportSuccess"
          :on-error="handleImportError"
          v-model:file-list="fileList"
          accept=".xlsx"
          :multiple="false"
          id="upload-sku-excel"
        >
          <el-icon class="el-icon--upload" style="font-size: 48px; color: #409eff;"><upload-filled /></el-icon>
          <div class="el-upload__text">拖拽 .xlsx 文件到此处，或 <em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">仅支持上传 <b>.xlsx</b> 格式文件，单个不超过 10MB</div>
          </template>
        </el-upload>
        <div v-if="uploading" class="uploading-tip">
          <el-icon class="is-loading"><Loading /></el-icon> 正在处理，请稍候...
        </div>
      </div>

      <div v-else>
        <el-alert title="处理完成" type="success" :closable="false" show-icon style="margin-bottom:16px" />
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="总行数">{{ importResult.totalCount }}</el-descriptions-item>
          <el-descriptions-item label="成功">
            <span style="color:#10b981;font-weight:600">{{ importResult.successCount }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="失败">
            <span style="color:#ef4444;font-weight:600">{{ importResult.errorCount }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="importResult.errors && importResult.errors.length > 0" style="margin-top:16px">
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

    <el-dialog
      v-model="skuSpecVisible"
      title="SKU制定规范"
      width="1080px"
      top="5vh"
      draggable
      destroy-on-close
      class="sku-dialog sku-spec-dialog"
    >
      <div class="sku-spec-content">
        <el-alert type="success" :closable="false" show-icon class="spec-banner">
          <template #title>一句话执行口径</template>
          <template #default>{{ SKU_SPEC_EXECUTION_SUMMARY }}</template>
        </el-alert>

        <div class="spec-metric-grid">
          <div class="spec-metric-card">
            <span class="spec-metric-value">4</span>
            <span class="spec-metric-label">已落地编码字典</span>
          </div>
          <div class="spec-metric-card">
            <span class="spec-metric-value">7</span>
            <span class="spec-metric-label">标准编码段位</span>
          </div>
          <div class="spec-metric-card">
            <span class="spec-metric-value">3</span>
            <span class="spec-metric-label">导入模板工作表</span>
          </div>
          <div class="spec-metric-card">
            <span class="spec-metric-value">新严老兼</span>
            <span class="spec-metric-label">当前兼容策略</span>
          </div>
        </div>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>一、这次已经落地了什么</h3>
            <p>本次已经把 SKU 新规则从“文档建议”落成了“系统可执行规则”。</p>
          </div>
          <div class="spec-list-card">
            <ul class="spec-list">
              <li v-for="item in skuSpecImplementedItems" :key="item">{{ item }}</li>
            </ul>
          </div>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>二、系统里现在的 SKU 标准格式</h3>
            <p>新增 SKU 统一采用七段式编码结构。</p>
          </div>
          <el-descriptions :column="2" border size="small" class="spec-descriptions">
            <el-descriptions-item label="统一格式">{{ skuSpecFormat }}</el-descriptions-item>
            <el-descriptions-item label="标准示例">
              <span class="spec-code">{{ skuSpecExample }}</span>
            </el-descriptions-item>
          </el-descriptions>
          <el-table :data="skuSpecSegments" border class="spec-table" size="small">
            <el-table-column type="index" label="#" width="60" align="center" />
            <el-table-column prop="code" label="示例段值" min-width="180">
              <template #default="{ row }">
                <span class="spec-code">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="meaning" label="含义" min-width="220" />
          </el-table>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>三、已落地的编码字典表</h3>
            <p>本次没有另外新建旁路表，而是直接接入系统现有“字典中心”。</p>
          </div>
          <el-table :data="skuSpecDictionaryTypes" border class="spec-table" size="small">
            <el-table-column prop="code" label="字典类型编码" min-width="180">
              <template #default="{ row }">
                <span class="spec-code">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="字典类型名称" min-width="150" />
            <el-table-column prop="usage" label="用途" min-width="140" />
          </el-table>
          <div class="spec-dict-grid">
            <div v-for="section in skuSpecDictionarySections" :key="section.dictType" class="spec-dict-card">
              <div class="spec-dict-card__header">
                <div>
                  <h4>{{ section.title }}</h4>
                  <p>{{ section.dictTypeName }} / {{ section.segment }}</p>
                </div>
                <el-tag size="small" effect="plain">{{ section.dictType }}</el-tag>
              </div>
              <el-table :data="section.items" border size="small">
                <el-table-column prop="code" label="编码" width="110">
                  <template #default="{ row }">
                    <span class="spec-code">{{ row.code }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="name" label="名称" min-width="140" />
              </el-table>
            </div>
          </div>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>四、系统已补的校验规则</h3>
            <p>当前校验覆盖新增、编辑、导入和兼容策略四个层面。</p>
          </div>
          <div class="spec-rule-grid">
            <div v-for="section in skuSpecValidationSections" :key="section.title" class="spec-info-card">
              <h4>{{ section.title }}</h4>
              <ul class="spec-list">
                <li v-for="item in section.items" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div class="spec-info-card spec-info-card--highlight">
              <h4>当前兼容策略</h4>
              <p class="spec-paragraph">为了不一下子打断已有业务，这次采用的是“新标准强校验，老数据兼容维护”。</p>
              <ul class="spec-list">
                <li v-for="item in skuSpecCompatibilityPolicy" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>五、导入模板现在有什么变化</h3>
            <p>下载的 SKU 导入模板现在已经不是单张表，而是三张表。</p>
          </div>
          <div class="spec-card-grid">
            <div v-for="sheet in skuSpecTemplateSheets" :key="sheet.title" class="spec-info-card">
              <h4>{{ sheet.title }}</h4>
              <p class="spec-paragraph">{{ sheet.description }}</p>
            </div>
          </div>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>六、系统里具体改到了哪里</h3>
            <p>规范已经同时落到前后端逻辑和模板能力里。</p>
          </div>
          <div class="spec-card-grid">
            <div v-for="changeGroup in skuSpecSystemChanges" :key="changeGroup.area" class="spec-info-card">
              <h4>{{ changeGroup.area }}</h4>
              <ul class="spec-list">
                <li v-for="item in changeGroup.items" :key="`${changeGroup.area}-${item.file}`">
                  <span class="spec-code">{{ item.file }}</span>
                  <span class="spec-list-desc">{{ item.description }}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>七、现在可以怎么用</h3>
            <p>不同角色可以按下面口径理解和执行。</p>
          </div>
          <div class="spec-card-grid">
            <div v-for="guide in skuSpecUsageGuides" :key="guide.title" class="spec-info-card">
              <h4>{{ guide.title }}</h4>
              <ul class="spec-list">
                <li v-for="item in guide.items" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="spec-section">
          <div class="spec-section-title">
            <h3>八、下一步建议</h3>
            <p>这次完成的是“规则落地第一步”，后续建议继续推进以下工作。</p>
          </div>
          <div class="spec-list-card">
            <ul class="spec-list">
              <li v-for="item in skuSpecNextSteps" :key="item">{{ item }}</li>
            </ul>
          </div>
        </section>
      </div>
      <template #footer>
        <el-button @click="skuSpecVisible = false">关闭</el-button>
      </template>
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
  line-height: 1;
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
.filter-form .el-form-item {
  margin-bottom: 12px;
}

/* 已选提示 */
.selection-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 8px 16px;
  color: #1d4ed8;
  font-size: 14px;
  margin-bottom: 12px;
}
.selection-bar b {
  font-weight: 700;
}

/* 表格 */
.sku-table {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.code-text {
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 12px;
  color: #0f6cbd;
  font-weight: 600;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
}

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
.sku-dialog :deep(.el-dialog__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px 12px 0 0;
  padding: 16px 20px;
}
.sku-dialog :deep(.el-dialog__title) {
  color: #fff;
  font-weight: 600;
}
.sku-dialog :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: rgba(255,255,255,.8);
}
.sku-dialog :deep(.el-dialog) {
  border-radius: 12px;
}
.form-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}
.uploading-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #409eff;
  margin-top: 12px;
  font-size: 14px;
  justify-content: center;
}

.sku-spec-dialog :deep(.el-dialog__body) {
  padding-top: 18px;
}

.sku-spec-content {
  max-height: 72vh;
  overflow-y: auto;
  padding-right: 6px;
}

.spec-banner {
  margin-bottom: 18px;
}

.spec-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.spec-metric-card {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border: 1px solid #dbeafe;
  border-radius: 12px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spec-metric-value {
  font-size: 24px;
  line-height: 1.1;
  font-weight: 700;
  color: #1d4ed8;
}

.spec-metric-label {
  font-size: 13px;
  color: #475569;
}

.spec-section + .spec-section {
  margin-top: 24px;
}

.spec-section-title {
  margin-bottom: 12px;
}

.spec-section-title h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: #0f172a;
}

.spec-section-title p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.spec-descriptions,
.spec-table {
  margin-top: 12px;
}

.spec-code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  color: #0f6cbd;
  font-weight: 600;
}

.spec-list-card,
.spec-info-card,
.spec-dict-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.spec-list {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  display: grid;
  gap: 8px;
}

.spec-dict-grid,
.spec-rule-grid,
.spec-card-grid {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.spec-dict-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.spec-rule-grid,
.spec-card-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.spec-dict-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.spec-dict-card__header h4,
.spec-info-card h4 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #0f172a;
}

.spec-dict-card__header p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.spec-paragraph {
  margin: 0;
  color: #475569;
  line-height: 1.7;
}

.spec-info-card--highlight {
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
  border-color: #fdba74;
}

.spec-list-desc {
  margin-left: 8px;
  color: #475569;
}

@media (max-width: 1200px) {
  .spec-metric-grid,
  .spec-dict-grid,
  .spec-rule-grid,
  .spec-card-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .spec-metric-grid,
  .spec-dict-grid,
  .spec-rule-grid,
  .spec-card-grid {
    grid-template-columns: 1fr;
  }

  .sku-spec-content {
    max-height: 68vh;
  }
}
</style>
