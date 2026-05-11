<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const router = useRouter()
const appStore = useAppStore()
const isSuperAdmin = computed(() => appStore.isSuperAdmin)

// status label map
const STATUS_MAP: Record<number, { label: string; type: string }> = {
  0: { label: '草稿', type: 'info' },
  1: { label: '已分配', type: 'warning' },
  2: { label: '已确认', type: 'primary' },
  3: { label: '已下发', type: 'success' },
  [-1]: { label: '已删除', type: 'danger' }
}

// ===== List state =====
const loading = ref(false)
const submissionRows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const query = reactive({
  keyword: '',
  status: ''
})

// ===== Create dialog state =====
const createDialogVisible = ref(false)
const createSaving = ref(false)
const confirmedVersions = ref<any[]>([])
const createForm = reactive({
  version_code: '',
  warehouse_count: 2,
  ratios: [70, 30] as number[]
})
const ratioError = ref('')

watch(
  () => createForm.ratios,
  (vals) => {
    const sum = vals.reduce((s, v) => s + v, 0)
    if (Math.abs(sum - 100) > 0.5) {
      ratioError.value = `比例之和应为 100%，当前 ${sum}%`
    } else {
      ratioError.value = ''
    }
  },
  { deep: true }
)

const addRatioField = () => {
  createForm.ratios.push(0)
  createForm.warehouse_count = createForm.ratios.length
}
const removeRatioField = (index: number) => {
  if (createForm.ratios.length <= 2) return
  createForm.ratios.splice(index, 1)
  createForm.warehouse_count = createForm.ratios.length
}
const syncWarehouseCount = () => {
  while (createForm.ratios.length < createForm.warehouse_count) {
    createForm.ratios.push(0)
  }
  while (createForm.ratios.length > createForm.warehouse_count) {
    createForm.ratios.pop()
  }
}

// ===== Edit drawer state =====
const editDrawerVisible = ref(false)
const editLoading = ref(false)
const activeSubmission = ref<any | null>(null)
const lineRows = ref<any[]>([])
const lineTotal = ref(0)
const linePage = ref(1)
const linePageSize = ref(20)

const lineFilters = reactive({
  keyword: '',
  channel: '',
  sku: '',
  week: '',
  shortage: ''
})

const lineFilterOptions = reactive<{
  channels: Array<{ channel_code: string; channel_name: string }>
  skus: Array<{ sku_code: string; sku_name: string }>
  weeks: string[]
}>({ channels: [], skus: [], weeks: [] })

// Editing state for inline cell edits
const editingCell = ref<{ lineId: number; whIndex: number } | null>(null)
const editingValue = ref('')
const stockWarnings = ref<any[]>([])

// ===== Computed =====
const canEdit = computed(() => {
  const s = activeSubmission.value
  if (!s) return false
  return s.status === 0 || s.status === 1
})

const canConfirm = computed(() => {
  const s = activeSubmission.value
  if (!s) return false
  return (s.status === 0 || s.status === 1)
})

const canDispatch = computed(() => {
  const s = activeSubmission.value
  if (!s) return false
  return s.status === 2
})

const allocationProgress = computed(() => {
  const s = activeSubmission.value
  if (!s) return { pct: 0, text: '' }
  const total = s.line_count || 0
  const done = s.fulfilled_count || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return { pct, text: `${done} / ${total}` }
})

// ===== API calls use global axios instance (inherits baseURL + auth interceptors) =====
const apiBase = '/demand/channel-submission'

// ===== List actions =====
const fetchList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get(apiBase, {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        keyword: query.keyword || undefined,
        status: query.status || undefined
      }
    })
    if (data.code === 200) {
      submissionRows.value = data.data.list || []
      total.value = data.data.total || 0
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '获取提报单列表失败')
  } finally {
    loading.value = false
  }
}

const handlePageChange = (p: number) => {
  page.value = p
  fetchList()
}
const handleSizeChange = (s: number) => {
  pageSize.value = s
  page.value = 1
  fetchList()
}
const handleQuery = () => {
  page.value = 1
  fetchList()
}

// ===== Create =====
const openCreateDialog = async () => {
  createForm.version_code = ''
  createForm.warehouse_count = 2
  createForm.ratios = [70, 30]
  ratioError.value = ''
  try {
    const { data } = await axios.get(`${apiBase}/confirmed-versions`)
    if (data.code === 200) {
      confirmedVersions.value = data.data || []
      if (confirmedVersions.value.length === 0) {
        ElMessage.warning('暂无已确认的需求计划版本，请先在渠道需求计划中确认一个版本')
        return
      }
    }
  } catch {
    ElMessage.warning('获取已确认版本失败')
    return
  }
  createDialogVisible.value = true
}

const handleCreate = async () => {
  if (!createForm.version_code) {
    ElMessage.warning('请选择需求计划版本')
    return
  }
  if (ratioError.value) {
    ElMessage.warning(ratioError.value)
    return
  }
  createSaving.value = true
  try {
    const ratios = createForm.ratios.map((r) => r / 100)
    const { data } = await axios.post(apiBase, {
      version_code: createForm.version_code,
      warehouse_count: createForm.warehouse_count,
      ratios
    })
    if (data.code === 200) {
      const result = data.data
      const totalLines = result.allocResult.allocated + result.allocResult.shortfall + result.allocResult.noStock
      ElMessage.success(`创建成功，共 ${totalLines} 行分配明细`)
      if (result.allocResult.shortfall > 0 || result.allocResult.noStock > 0) {
        ElMessage.warning(
          `注意：${result.allocResult.shortfall} 行有缺口，${result.allocResult.noStock} 行无可用库存`
        )
      }
      createDialogVisible.value = false
      fetchList()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '创建提报单失败')
  } finally {
    createSaving.value = false
  }
}

// ===== Delete =====
const handleDelete = async (submission: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除提报单 ${submission.submission_no} 吗？`,
      '删除确认',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    const { data } = await axios.delete(`${apiBase}/${submission.submission_no}`)
    if (data.code === 200) {
      ElMessage.success('删除成功')
      fetchList()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '删除失败')
  }
}

// ===== Edit / View =====
const openEditDrawer = async (submission: any) => {
  editLoading.value = true
  editDrawerVisible.value = true
  linePage.value = 1
  lineFilters.keyword = ''
  lineFilters.channel = ''
  lineFilters.sku = ''
  lineFilters.week = ''
  lineFilters.shortage = ''
  stockWarnings.value = []
  try {
    const { data } = await axios.get(`${apiBase}/${submission.submission_no}`)
    if (data.code === 200) {
      activeSubmission.value = data.data
    }
    await fetchLines()
    await fetchLineFilters()
    await checkStockWarnings()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '获取提报单详情失败')
    editDrawerVisible.value = false
  } finally {
    editLoading.value = false
  }
}

const fetchLines = async () => {
  if (!activeSubmission.value) return
  try {
    const { data } = await axios.get(`${apiBase}/${activeSubmission.value.submission_no}/lines`, {
      params: {
        page: linePage.value,
        pageSize: linePageSize.value,
        keyword: lineFilters.keyword || undefined,
        channel: lineFilters.channel || undefined,
        sku: lineFilters.sku || undefined,
        week: lineFilters.week || undefined,
        shortage: lineFilters.shortage || undefined
      }
    })
    if (data.code === 200) {
      lineRows.value = data.data.list || []
      lineTotal.value = data.data.total || 0
      // Refresh active submission stats
      if (data.data.submission) {
        activeSubmission.value = { ...activeSubmission.value, ...data.data.submission }
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '获取分配明细失败')
  }
}

const fetchLineFilters = async () => {
  if (!activeSubmission.value) return
  try {
    const { data } = await axios.get(`${apiBase}/options/${activeSubmission.value.submission_no}`)
    if (data.code === 200) {
      lineFilterOptions.channels = data.data.channels || []
      lineFilterOptions.skus = data.data.skus || []
      lineFilterOptions.weeks = data.data.weeks || []
    }
  } catch { /* silent */ }
}

const checkStockWarnings = async () => {
  if (!activeSubmission.value || !lineRows.value.length) return
  const warnings: any[] = []
  for (const line of lineRows.value) {
    for (const wh of (line.warehouses || [])) {
      if (wh.allocation_qty > wh.available_qty) {
        warnings.push({
          channel: line.lv2_channel_name,
          sku: `${line.sku_code} ${line.sku_name}`,
          week: line.plan_week,
          warehouse: wh.warehouse_name,
          allocated: wh.allocation_qty,
          available: wh.available_qty,
          message: `${line.sku_name} → ${wh.warehouse_name}: 分配 ${wh.allocation_qty} ＞ 可用库存 ${wh.available_qty}，超出 ${wh.allocation_qty - wh.available_qty} 件`
        })
      }
    }
  }
  stockWarnings.value = warnings
}

const handleLinePageChange = (p: number) => {
  linePage.value = p
  fetchLines()
}
const handleLineSizeChange = (s: number) => {
  linePageSize.value = s
  linePage.value = 1
  fetchLines()
}
const handleLineFilterChange = () => {
  linePage.value = 1
  fetchLines()
}

// ===== Inline editing =====
const startEditCell = (lineId: number, whIndex: number, currentValue: number) => {
  if (!canEdit.value) return
  editingCell.value = { lineId, whIndex }
  editingValue.value = String(currentValue)
}

const finishEditCell = async (line: any) => {
  if (!editingCell.value) return

  const newVal = Number(editingValue.value)
  if (isNaN(newVal) || newVal < 0) {
    ElMessage.warning('请输入有效数字')
    editingCell.value = null
    return
  }

  // Update the warehouse allocation value locally
  const whs = [...(line.warehouses || [])]
  if (editingCell.value.whIndex < whs.length) {
    whs[editingCell.value.whIndex] = {
      ...whs[editingCell.value.whIndex],
      allocation_qty: newVal
    }
  }

  try {
    const { data } = await axios.put(`${apiBase}/${activeSubmission.value.submission_no}/lines/${line.id}`, {
      warehouses: whs.map((w: any) => ({
        warehouse_code: w.warehouse_code,
        warehouse_name: w.warehouse_name,
        allocation_qty: w.allocation_qty,
        available_qty: w.available_qty,
        total_qty: w.total_qty
      }))
    })
    if (data.code === 200) {
      ElMessage.success('已更新')
      await fetchLines()
      await checkStockWarnings()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '更新失败')
  }
  editingCell.value = null
}

const cancelEditCell = () => {
  editingCell.value = null
}

const handleEditKeydown = (e: KeyboardEvent, line: any) => {
  if (e.key === 'Enter') {
    finishEditCell(line)
  } else if (e.key === 'Escape') {
    cancelEditCell()
  }
}

// ===== Auto allocate =====
const handleAutoAllocate = async () => {
  if (!activeSubmission.value) return
  try {
    await ElMessageBox.confirm(
      '将按照当前提报单设置的仓库数量和比例重新自动分配所有明细行，原有手动调整将被覆盖。确定继续？',
      '自动分配确认',
      { type: 'warning' }
    )
  } catch {
    return
  }
  editLoading.value = true
  try {
    const s = activeSubmission.value
    const ratios = (s.ratios || [0.7, 0.3]).map((r: number) => r)
    const { data } = await axios.post(`${apiBase}/${s.submission_no}/auto-allocate`, {
      warehouse_count: s.warehouse_count,
      ratios
    })
    if (data.code === 200) {
      const r = data.data
      ElMessage.success(`自动分配完成: 足额${r.allocated}行, 缺额${r.shortfall}行, 无库存${r.noStock}行`)
      await openEditDrawer({ ...activeSubmission.value })
      // Re-fetch detail
      const detail = await axios.get(`${apiBase}/${s.submission_no}`)
      if (detail.data.code === 200) activeSubmission.value = detail.data.data
      await fetchLines()
      await checkStockWarnings()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '自动分配失败')
  } finally {
    editLoading.value = false
  }
}

// ===== Confirm =====
const handleConfirm = async () => {
  if (!activeSubmission.value) return

  try {
    await ElMessageBox.confirm(
      '确认后将生成发货指引，之后可手动下发生成调拨单和锁定库存。确定确认？',
      '确认提报',
      { type: 'warning' }
    )
  } catch {
    return
  }

  try {
    const { data } = await axios.post(`${apiBase}/${activeSubmission.value.submission_no}/confirm`)
    if (data.code === 200) {
      const warnings = data.data?.warnings || []
      if (warnings.length > 0) {
        ElMessage.warning(`确认成功，但存在 ${warnings.length} 个库存缺口警告`)
        warnings.slice(0, 5).forEach((w: any) => {
          ElMessage({ type: 'warning', message: w.message, duration: 5000 })
        })
      } else {
        ElMessage.success('确认成功')
      }
      const detail = await axios.get(`${apiBase}/${activeSubmission.value.submission_no}`)
      if (detail.data.code === 200) activeSubmission.value = detail.data.data
      await fetchLines()
      fetchList()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '确认失败')
  }
}

// ===== Dispatch =====
const handleDispatch = async () => {
  if (!activeSubmission.value) return

  try {
    await ElMessageBox.confirm(
      '下发后将自动生成调拨单并锁定对应仓库库存，此操作不可撤销。确定下发？',
      '下发确认',
      { type: 'warning' }
    )
  } catch {
    return
  }

  try {
    const { data } = await axios.post(`${apiBase}/${activeSubmission.value.submission_no}/dispatch`)
    if (data.code === 200) {
      ElMessage.success(`下发成功: 生成 ${data.data?.transferOrderCount || 0} 个调拨单, 锁定 ${data.data?.lockCount || 0} 条库存`)
      const detail = await axios.get(`${apiBase}/${activeSubmission.value.submission_no}`)
      if (detail.data.code === 200) activeSubmission.value = detail.data
      await fetchLines()
      fetchList()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '下发失败')
  }
}

// ===== Export =====
const handleExport = async () => {
  if (!activeSubmission.value) return
  try {
    const resp = await axios.get(`${apiBase}/${activeSubmission.value.submission_no}/export`, {
      responseType: 'blob'
    })
    const blobUrl = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    const disposition = resp.headers['content-disposition'] || ''
    const match = disposition.match(/filename\*=UTF-8''(.+)/)
    a.download = match ? decodeURIComponent(match[1]) : `渠道需求提报_${activeSubmission.value.submission_no}.xlsx`
    a.href = blobUrl
    a.click()
    URL.revokeObjectURL(blobUrl)
    ElMessage.success('导出成功')
  } catch (e: any) {
    const errMsg = await e?.response?.data?.text?.() || '导出失败'
    ElMessage.error(errMsg)
  }
}

// ===== format helpers =====
const fmtQty = (v: any) => (Number(v) || 0).toLocaleString()
const fmtRatio = (v: any) => `${((Number(v) || 0) * 100).toFixed(1)}%`
const statusTag = (status: number) => STATUS_MAP[status] || { label: '未知', type: 'info' }
const statusLabel = (status: number) => {
  const m = STATUS_MAP[status]
  return m ? m.label : '未知'
}

const colorByShortage = (v: any) => {
  const n = Number(v) || 0
  if (n <= 0) return '#67c23a'
  if (n < 100) return '#e6a23c'
  return '#f56c6c'
}

// ===== Navigation =====
const goToDemandPlan = () => {
  router.push('/demand/channel-plan')
}

// ===== Init =====
onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="channel-demand-submission">
    <!-- Header -->
    <div class="page-header">
      <h3>渠道需求提报</h3>
      <el-button type="primary" @click="openCreateDialog">新建提报单</el-button>
    </div>

    <!-- List Card -->
    <el-card shadow="never" class="list-card">
      <!-- Filters -->
      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索提报编号/计划编号"
          clearable
          style="width: 260px"
          @keydown.enter="handleQuery"
          @clear="handleQuery"
        />
        <el-select v-model="query.status" placeholder="状态筛选" clearable style="width: 140px" @change="handleQuery">
          <el-option label="草稿" :value="0" />
          <el-option label="已分配" :value="1" />
          <el-option label="已确认" :value="2" />
          <el-option label="已下发" :value="3" />
        </el-select>
        <el-button type="primary" @click="handleQuery">查询</el-button>
      </div>

      <!-- Table -->
      <el-table v-loading="loading" :data="submissionRows" stripe style="width: 100%">
        <el-table-column prop="submission_no" label="提报编号" width="200" />
        <el-table-column label="关联计划" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="goToDemandPlan()">
              {{ row.plan_name }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="version_label" label="版本" width="160" show-overflow-tooltip />
        <el-table-column label="周范围" width="180">
          <template #default="{ row }">
            {{ row.begin_week }} ~ {{ row.end_week }}
          </template>
        </el-table-column>
        <el-table-column label="分配进度" width="120" align="center">
          <template #default="{ row }">
            <span>{{ row.fulfilled_count }} / {{ row.line_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status).type" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" width="100" />
        <el-table-column prop="created_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEditDrawer(row)">查看/编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)"
              :disabled="row.status === 3">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-bar">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :page-sizes="[10, 20, 50]"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <!-- Create Dialog -->
    <el-dialog
      v-model="createDialogVisible"
      title="新建渠道需求提报单"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="120px" label-position="right">
        <el-form-item label="需求计划版本" required>
          <el-select
            v-model="createForm.version_code"
            placeholder="请选择已确认的需求计划版本"
            style="width: 100%"
          >
            <el-option
              v-for="v in confirmedVersions"
              :key="v.version_code"
              :label="`${v.plan_name} - ${v.version_label} (${v.begin_week}~${v.end_week})`"
              :value="v.version_code"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="仓库数量" required>
          <el-input-number
            v-model="createForm.warehouse_count"
            :min="1"
            :max="10"
            @change="syncWarehouseCount"
          />
          <span class="form-hint">每个 SKU 最多从此数量的仓库中分配</span>
        </el-form-item>

        <el-form-item label="分配比例 (%)">
          <div style="width: 100%">
            <div v-for="(ratio, index) in createForm.ratios" :key="index" class="ratio-row">
              <span class="ratio-label">仓库 {{ index + 1 }}</span>
              <el-input-number
                v-model="createForm.ratios[index]"
                :min="0"
                :max="100"
                :precision="1"
                style="width: 160px"
                controls-position="right"
              />
              <span class="ratio-unit">%</span>
              <el-button
                v-if="createForm.ratios.length > 2"
                type="danger"
                link
                size="small"
                @click="removeRatioField(index)"
              >删除</el-button>
            </div>
            <el-button type="primary" link size="small" @click="addRatioField">
              + 增加仓库
            </el-button>
            <div v-if="ratioError" style="color: #f56c6c; font-size: 12px; margin-top: 4px">
              {{ ratioError }}
            </div>
            <div v-else style="color: #909399; font-size: 12px; margin-top: 4px">
              比例合计：{{ createForm.ratios.reduce((s, v) => s + v, 0).toFixed(1) }}%（需为 100%）
            </div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" :disabled="!!ratioError" @click="handleCreate">
          创建并自动分配
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit Drawer -->
    <el-drawer
      v-model="editDrawerVisible"
      title="提报单详情"
      size="90%"
      :close-on-click-modal="false"
      @closed="activeSubmission = null; lineRows = []"
    >
      <template v-if="activeSubmission">
        <!-- Submission Header -->
        <div class="submission-header">
          <div class="header-row">
            <div class="header-item">
              <span class="header-label">提报编号</span>
              <span class="header-value"><strong>{{ activeSubmission.submission_no }}</strong></span>
            </div>
            <div class="header-item">
              <span class="header-label">关联计划</span>
              <span class="header-value">
                <el-button type="primary" link size="small" @click="goToDemandPlan()">
                  {{ activeSubmission.plan_name }}
                </el-button>
              </span>
            </div>
            <div class="header-item">
              <span class="header-label">版本</span>
              <span class="header-value">{{ activeSubmission.version_label }}</span>
            </div>
            <div class="header-item">
              <span class="header-label">周范围</span>
              <span class="header-value">{{ activeSubmission.begin_week }} ~ {{ activeSubmission.end_week }}</span>
            </div>
            <div class="header-item">
              <span class="header-label">状态</span>
              <el-tag :type="statusTag(activeSubmission.status).type" size="small">
                {{ statusLabel(activeSubmission.status) }}
              </el-tag>
            </div>
            <div class="header-item">
              <span class="header-label">分配进度</span>
              <el-progress
                :percentage="allocationProgress.pct"
                :text-inside="true"
                :stroke-width="18"
                :status="allocationProgress.pct === 100 ? 'success' : 'warning'"
                style="width: 160px"
              />
            </div>
          </div>
        </div>

        <!-- Stock Warnings -->
        <el-alert
          v-if="stockWarnings.length > 0"
          title="库存预警"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        >
          <template #default>
            <div v-for="(w, i) in stockWarnings.slice(0, 3)" :key="i" style="font-size: 13px; line-height: 1.8">
              {{ w.message }}
            </div>
            <div v-if="stockWarnings.length > 3" style="font-size: 12px; color: #909399; margin-top: 4px">
              还有 {{ stockWarnings.length - 3 }} 条预警...
            </div>
          </template>
        </el-alert>

        <!-- Line Filters -->
        <div class="filter-bar" style="margin-bottom: 10px">
          <el-input
            v-model="lineFilters.keyword"
            placeholder="搜索渠道/SKU"
            clearable
            style="width: 200px"
            @keydown.enter="handleLineFilterChange"
            @clear="handleLineFilterChange"
          />
          <el-select
            v-model="lineFilters.channel"
            placeholder="渠道"
            clearable
            style="width: 160px"
            @change="handleLineFilterChange"
          >
            <el-option
              v-for="ch in lineFilterOptions.channels"
              :key="ch.channel_code"
              :label="ch.channel_name"
              :value="ch.channel_code"
            />
          </el-select>
          <el-select
            v-model="lineFilters.sku"
            placeholder="SKU"
            clearable
            style="width: 180px"
            @change="handleLineFilterChange"
          >
            <el-option
              v-for="sk in lineFilterOptions.skus"
              :key="sk.sku_code"
              :label="`${sk.sku_code} ${sk.sku_name}`"
              :value="sk.sku_code"
            />
          </el-select>
          <el-select
            v-model="lineFilters.week"
            placeholder="周次"
            clearable
            style="width: 120px"
            @change="handleLineFilterChange"
          >
            <el-option v-for="w in lineFilterOptions.weeks" :key="w" :label="w" :value="w" />
          </el-select>
          <el-checkbox v-model="lineFilters.shortage" true-label="1" false-label="" @change="handleLineFilterChange">
            仅显示有缺口
          </el-checkbox>
        </div>

        <!-- Allocation Table -->
        <el-table
          v-loading="editLoading"
          :data="lineRows"
          stripe
          border
          style="width: 100%"
          max-height="calc(100vh - 380px)"
        >
          <el-table-column prop="lv2_channel_name" label="渠道" width="120" fixed="left" />
          <el-table-column label="SKU" width="200" fixed="left">
            <template #default="{ row }">
              <div>{{ row.sku_code }}</div>
              <div style="font-size: 12px; color: #909399">{{ row.sku_name }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="plan_week" label="周" width="90" align="center" />
          <el-table-column label="计划需求量" width="110" align="right">
            <template #default="{ row }">
              <strong>{{ fmtQty(row.plan_value) }}</strong>
            </template>
          </el-table-column>

          <!-- Dynamic warehouse columns -->
          <el-table-column
            v-for="(wh, whIdx) in (lineRows[0]?.warehouses || [])"
            :key="'wh_' + whIdx"
            min-width="180"
          >
            <template #header>
              <div style="text-align: center">
                <div>{{ wh.warehouse_name }}</div>
                <div style="font-size: 11px; color: #909399">{{ wh.warehouse_code }}</div>
              </div>
            </template>
            <template #default="{ row }">
              <div class="wh-cell">
                <template v-if="row.warehouses && row.warehouses[whIdx]">
                  <div
                    v-if="editingCell?.lineId === row.id && editingCell?.whIndex === whIdx"
                    class="edit-cell"
                  >
                    <el-input
                      v-model="editingValue"
                      size="small"
                      style="width: 90px"
                      @keydown="handleEditKeydown($event, row)"
                      @blur="finishEditCell(row)"
                      ref=""
                    />
                  </div>
                  <div
                    v-else
                    class="qty-display"
                    :class="{ editable: canEdit }"
                    @click="canEdit && startEditCell(row.id, whIdx, row.warehouses[whIdx].allocation_qty)"
                  >
                    <span
                      :style="{
                        color: row.warehouses[whIdx].allocation_qty > row.warehouses[whIdx].available_qty ? '#f56c6c' : '#303133',
                        fontWeight: 'bold'
                      }"
                    >
                      {{ fmtQty(row.warehouses[whIdx].allocation_qty) }}
                    </span>
                    <span style="font-size: 12px; color: #909399; margin-left: 4px">
                      {{ fmtRatio(row.warehouses[whIdx].allocation_ratio) }}
                    </span>
                  </div>
                  <div style="font-size: 11px; color: #909399">
                    库存: {{ fmtQty(row.warehouses[whIdx].available_qty) }}
                    <el-tooltip
                      v-if="row.warehouses[whIdx].allocation_qty > row.warehouses[whIdx].available_qty"
                      content="分配量超过可用库存！"
                      placement="top"
                    >
                      <span style="color: #f56c6c; cursor: help"> ⚠</span>
                    </el-tooltip>
                  </div>
                </template>
                <template v-else>
                  <span style="color: #c0c4cc">—</span>
                </template>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="已分配合计" width="110" align="right">
            <template #default="{ row }">
              <strong>{{ fmtQty(row.total_allocated) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="缺口" width="100" align="right">
            <template #default="{ row }">
              <strong :style="{ color: colorByShortage(row.shortage) }">
                {{ row.shortage > 0 ? fmtQty(row.shortage) : '—' }}
              </strong>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="85" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
                {{ row.status === 1 ? '足额' : '缺额' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <!-- Line Pagination -->
        <div class="pagination-bar">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next"
            :total="lineTotal"
            :page-size="linePageSize"
            :current-page="linePage"
            :page-sizes="[10, 20, 50, 100]"
            @current-change="handleLinePageChange"
            @size-change="handleLineSizeChange"
          />
        </div>
      </template>

      <!-- Drawer Footer -->
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="handleAutoAllocate" :disabled="!canEdit" :loading="editLoading">
            一键自动分配
          </el-button>
          <el-button @click="handleExport" :disabled="!activeSubmission">
            导出发货指引
          </el-button>
          <el-button
            type="primary"
            @click="handleConfirm"
            :disabled="!canConfirm"
          >
            确认提报
          </el-button>
          <el-button
            type="success"
            @click="handleDispatch"
            :disabled="!canDispatch"
          >
            下发生效
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.channel-demand-submission {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.list-card {
  margin-bottom: 16px;
}

.filter-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

/* Create Dialog */
.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.ratio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.ratio-label {
  width: 60px;
  font-size: 13px;
  color: #606266;
}

.ratio-unit {
  font-size: 13px;
  color: #606266;
  margin-left: -4px;
}

/* Submission Header */
.submission-header {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 14px 18px;
  margin-bottom: 14px;
}

.header-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}

.header-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-label {
  font-size: 12px;
  color: #909399;
}

.header-value {
  font-size: 14px;
  color: #303133;
}

/* Warehouse cells */
.wh-cell {
  text-align: center;
  padding: 2px 0;
}

.qty-display {
  cursor: default;
  padding: 4px;
  border-radius: 4px;
}

.qty-display.editable {
  cursor: pointer;
}

.qty-display.editable:hover {
  background: #ecf5ff;
}

.edit-cell {
  display: flex;
  justify-content: center;
}

/* Drawer footer */
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
