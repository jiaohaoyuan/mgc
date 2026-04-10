<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'

const activeTab = ref('ledger')

const options = reactive<any>({
  tx_types: [],
  transfer_status: [],
  warning_types: [],
  warning_level: [],
  warning_status: [],
  warehouses: [],
  skus: []
})

const dashboard = reactive<any>({
  summary: {
    total_qty: 0,
    available_qty: 0,
    locked_qty: 0,
    in_transit_qty: 0,
    safety_qty: 0,
    available_rate: 0,
    safety_cover_rate: 0,
    open_warning_count: 0,
    processing_warning_count: 0,
    closed_warning_count: 0,
    critical_warning_count: 0,
    high_warning_count: 0,
    active_transfer_count: 0,
    pending_review_count: 0,
    approved_count: 0,
    outbound_count: 0,
    done_transfer_count: 0,
    active_lock_qty: 0,
    active_lock_orders: 0,
    released_lock_count: 0,
    today_inbound_qty: 0,
    today_outbound_qty: 0,
    today_lock_qty: 0,
    today_release_qty: 0,
    today_exception_qty: 0,
    today_transfer_created: 0,
    today_transfer_done: 0
  },
  trend: [],
  transfer_status: [],
  warning_status: [],
  warning_level: [],
  warning_type: [],
  warning_hotspots: []
})

const trendChartRef = ref<HTMLDivElement>()
const transferChartRef = ref<HTMLDivElement>()
const warningChartRef = ref<HTMLDivElement>()

let trendChart: echarts.ECharts | null = null
let transferChart: echarts.ECharts | null = null
let warningChart: echarts.ECharts | null = null

const ledgerRows = ref<any[]>([])
const ledgerSummary = reactive<any>({ total_qty: 0, available_qty: 0, locked_qty: 0, in_transit_qty: 0, safety_qty: 0 })
const ledgerTotal = ref(0)
const ledgerPage = ref(1)
const ledgerPageSize = ref(10)
const ledgerLoading = ref(false)
const ledgerQuery = reactive<any>({ warehouseCode: '', skuCode: '', keyword: '', nearExpiry: '', unsellable: '' })

const txRows = ref<any[]>([])
const txTotal = ref(0)
const txPage = ref(1)
const txPageSize = ref(10)
const txLoading = ref(false)
const txQuery = reactive<any>({ txType: '', keyword: '' })

const transferRows = ref<any[]>([])
const transferTotal = ref(0)
const transferPage = ref(1)
const transferPageSize = ref(10)
const transferLoading = ref(false)
const transferQuery = reactive<any>({ status: '', keyword: '' })

const warningRows = ref<any[]>([])
const warningTotal = ref(0)
const warningPage = ref(1)
const warningPageSize = ref(10)
const warningLoading = ref(false)
const warningQuery = reactive<any>({ type: '', level: '', status: '', keyword: '' })

const capabilityRows = ref<any[]>([])
const capabilityTotal = ref(0)
const capabilityPage = ref(1)
const capabilityPageSize = ref(10)
const capabilityLoading = ref(false)
const capabilityQuery = reactive<any>({ keyword: '' })

const lockRows = ref<any[]>([])
const lockTotal = ref(0)
const lockPage = ref(1)
const lockPageSize = ref(10)
const lockLoading = ref(false)
const lockQuery = reactive<any>({ orderNo: '', status: '', keyword: '' })

const txDialogVisible = ref(false)
const txSubmitting = ref(false)
const txForm = reactive<any>({
  tx_type: 'INBOUND',
  source_doc_type: 'MANUAL',
  source_doc_no: '',
  warehouse_code: '',
  sku_code: '',
  batch_no: '',
  qty: 0,
  adjust_qty: 0,
  remark: ''
})

const transferDialogVisible = ref(false)
const transferSubmitting = ref(false)
const transferForm = reactive<any>({
  out_warehouse_code: '',
  in_warehouse_code: '',
  sku_code: '',
  batch_no: '',
  qty: 0,
  reason: ''
})

const capabilityDialogVisible = ref(false)
const capabilitySubmitting = ref(false)
const editingCapabilityId = ref(0)
const capabilityForm = reactive<any>({
  service_regions: '',
  daily_capacity: 0,
  processing_capacity: 0,
  delivery_ttl_hours: 24,
  supported_skus: '',
  supported_categories: ''
})

const detailDrawerVisible = ref(false)
const detailLoading = ref(false)
const currentLedgerDetail = ref<any>(null)

const transferDrawerVisible = ref(false)
const transferDetailLoading = ref(false)
const currentTransferDetail = ref<any>(null)
const currentTransferTracks = ref<any[]>([])

const warehouseNameMap = computed(() => Object.fromEntries((options.warehouses || []).map((item: any) => [item.warehouse_code, item.warehouse_name])))
const skuNameMap = computed(() => Object.fromEntries((options.skus || []).map((item: any) => [item.sku_code, item.sku_name])))

const transferStatusLabelMap: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  APPROVED: '已审核',
  OUTBOUND: '调出中',
  DONE: '已完成',
  CANCELED: '已取消'
}

const warningStatusLabelMap: Record<string, string> = {
  OPEN: '待处理',
  PROCESSING: '处理中',
  CLOSED: '已关闭'
}

const warningTypeLabelMap: Record<string, string> = {
  LOW_STOCK: '低库存',
  OVER_STOCK: '超储',
  NEAR_EXPIRY: '临期',
  STOCKOUT: '缺货'
}

const warningLevelLabelMap: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重'
}

const formatNumber = (value: number | string) => Number(value || 0).toLocaleString('zh-CN')

const overviewCards = computed(() => [
  {
    key: 'total',
    label: '总库存',
    value: dashboard.summary.total_qty || 0,
    meta: `安全库存 ${formatNumber(dashboard.summary.safety_qty || 0)}`,
    tone: 'slate'
  },
  {
    key: 'available',
    label: '可用库存',
    value: dashboard.summary.available_qty || 0,
    meta: `可用率 ${dashboard.summary.available_rate || 0}%`,
    tone: 'emerald'
  },
  {
    key: 'transit',
    label: '在途库存',
    value: dashboard.summary.in_transit_qty || 0,
    meta: `今日新建调拨 ${dashboard.summary.today_transfer_created || 0} 单`,
    tone: 'blue'
  },
  {
    key: 'transfer',
    label: '活跃调拨',
    value: dashboard.summary.active_transfer_count || 0,
    meta: `待审 ${dashboard.summary.pending_review_count || 0} / 调出中 ${dashboard.summary.outbound_count || 0}`,
    tone: 'amber'
  },
  {
    key: 'warning',
    label: '活跃预警',
    value: dashboard.summary.open_warning_count || 0,
    meta: `严重 ${dashboard.summary.critical_warning_count || 0} / 高级 ${dashboard.summary.high_warning_count || 0}`,
    tone: 'rose'
  },
  {
    key: 'lock',
    label: '活跃锁定',
    value: dashboard.summary.active_lock_qty || 0,
    meta: `订单 ${dashboard.summary.active_lock_orders || 0} / 已释放 ${dashboard.summary.released_lock_count || 0}`,
    tone: 'violet'
  }
])

const todayFlowItems = computed(() => [
  { label: '今日入库', value: dashboard.summary.today_inbound_qty || 0 },
  { label: '今日出库', value: dashboard.summary.today_outbound_qty || 0 },
  { label: '今日锁定', value: dashboard.summary.today_lock_qty || 0 },
  { label: '今日释放', value: dashboard.summary.today_release_qty || 0 },
  { label: '异常损耗', value: dashboard.summary.today_exception_qty || 0 },
  { label: '完成调拨', value: dashboard.summary.today_transfer_done || 0 }
])

const warningStatusCards = computed(() => (dashboard.warning_status || []).map((item: any) => ({
  ...item,
  label: warningStatusLabelMap[item.status] || item.status
})))

const warningTypeRanking = computed(() => {
  const total = (dashboard.warning_type || []).reduce((sum: number, item: any) => sum + Number(item.count || 0), 0)
  return (dashboard.warning_type || []).map((item: any) => ({
    ...item,
    label: warningTypeLabelMap[item.type] || item.type,
    percent: total ? Math.round((Number(item.count || 0) / total) * 100) : 0
  }))
})

const warningHotspots = computed(() => dashboard.warning_hotspots || [])
const maxHotspotCount = computed(() => Math.max(1, ...warningHotspots.value.map((item: any) => Number(item.count || 0))))

const enrichByCode = (row: any) => ({
  ...row,
  warehouse_name: row.warehouse_name || warehouseNameMap.value[row.warehouse_code] || row.warehouse_code,
  sku_name: row.sku_name || skuNameMap.value[row.sku_code] || row.sku_code
})

const ensureCharts = () => {
  if (trendChartRef.value && !trendChart) trendChart = echarts.init(trendChartRef.value)
  if (transferChartRef.value && !transferChart) transferChart = echarts.init(transferChartRef.value)
  if (warningChartRef.value && !warningChart) warningChart = echarts.init(warningChartRef.value)
}

const renderCharts = () => {
  ensureCharts()

  const trend = dashboard.trend || []
  trendChart?.setOption({
    color: ['#1f7a8c', '#d95d39', '#4f772d', '#b56576'],
    tooltip: { trigger: 'axis' },
    legend: { top: 0, icon: 'roundRect' },
    grid: { left: 36, right: 18, top: 42, bottom: 28 },
    xAxis: {
      type: 'category',
      data: trend.map((item: any) => String(item.date || '').slice(5)),
      axisLine: { lineStyle: { color: '#c7d2da' } }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#edf2f7' } }
    },
    series: [
      { name: '入库', type: 'bar', barMaxWidth: 18, data: trend.map((item: any) => Number(item.inbound_qty || 0)) },
      { name: '出库', type: 'bar', barMaxWidth: 18, data: trend.map((item: any) => Number(item.outbound_qty || 0)) },
      { name: '锁定', type: 'line', smooth: true, symbolSize: 8, data: trend.map((item: any) => Number(item.lock_qty || 0)) },
      { name: '异常损耗', type: 'line', smooth: true, symbolSize: 8, data: trend.map((item: any) => Number(item.adjust_qty || 0) + Number(item.damage_qty || 0)) }
    ]
  })

  transferChart?.setOption({
    color: ['#5c7cfa', '#f59f00', '#12b886', '#e8590c', '#2f9e44', '#868e96'],
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, icon: 'circle' },
    series: [{
      name: '调拨状态',
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{c}' },
      data: (dashboard.transfer_status || [])
        .filter((item: any) => Number(item.count || 0) > 0)
        .map((item: any) => ({ name: transferStatusLabelMap[item.status] || item.status, value: Number(item.count || 0) }))
    }]
  })

  warningChart?.setOption({
    color: ['#9c6644', '#e9c46a', '#e76f51', '#c1121f'],
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, icon: 'circle' },
    series: [{
      name: '预警级别',
      type: 'pie',
      radius: ['42%', '70%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{c}' },
      data: (dashboard.warning_level || [])
        .filter((item: any) => Number(item.count || 0) > 0)
        .map((item: any) => ({ name: warningLevelLabelMap[item.level] || item.level, value: Number(item.count || 0) }))
    }]
  })
}

const resizeCharts = () => {
  trendChart?.resize()
  transferChart?.resize()
  warningChart?.resize()
}

const fetchOptions = async () => {
  const res = await axios.get('/inventory-ops/options')
  Object.assign(options, res.data.data || {})
}

const fetchDashboard = async () => {
  const res = await axios.get('/inventory-ops/dashboard')
  const data = res.data.data || {}
  dashboard.summary = { ...dashboard.summary, ...(data.summary || {}) }
  dashboard.trend = data.trend || []
  dashboard.transfer_status = data.transfer_status || []
  dashboard.warning_status = data.warning_status || []
  dashboard.warning_level = data.warning_level || []
  dashboard.warning_type = data.warning_type || []
  dashboard.warning_hotspots = data.warning_hotspots || []
  await nextTick()
  renderCharts()
}

const fetchLedger = async () => {
  ledgerLoading.value = true
  try {
    const res = await axios.get('/inventory-ops/ledger/list', {
      params: {
        ...ledgerQuery,
        page: ledgerPage.value,
        pageSize: ledgerPageSize.value
      }
    })
    ledgerRows.value = (res.data.data?.list || []).map(enrichByCode)
    ledgerTotal.value = res.data.data?.total || 0
    Object.assign(ledgerSummary, res.data.data?.summary || {})
  } finally {
    ledgerLoading.value = false
  }
}

const fetchTransactions = async () => {
  txLoading.value = true
  try {
    const res = await axios.get('/inventory-ops/transactions/list', {
      params: {
        ...txQuery,
        page: txPage.value,
        pageSize: txPageSize.value
      }
    })
    txRows.value = (res.data.data?.list || []).map(enrichByCode)
    txTotal.value = res.data.data?.total || 0
  } finally {
    txLoading.value = false
  }
}

const fetchTransfers = async () => {
  transferLoading.value = true
  try {
    const res = await axios.get('/inventory-ops/transfers/list', {
      params: {
        ...transferQuery,
        page: transferPage.value,
        pageSize: transferPageSize.value
      }
    })
    transferRows.value = (res.data.data?.list || []).map(enrichByCode)
    transferTotal.value = res.data.data?.total || 0
  } finally {
    transferLoading.value = false
  }
}

const fetchWarnings = async () => {
  warningLoading.value = true
  try {
    const res = await axios.get('/inventory-ops/warnings/list', {
      params: {
        ...warningQuery,
        page: warningPage.value,
        pageSize: warningPageSize.value
      }
    })
    warningRows.value = (res.data.data?.list || []).map(enrichByCode)
    warningTotal.value = res.data.data?.total || 0
  } finally {
    warningLoading.value = false
  }
}

const fetchCapabilities = async () => {
  capabilityLoading.value = true
  try {
    const res = await axios.get('/inventory-ops/capabilities/list', {
      params: {
        ...capabilityQuery,
        page: capabilityPage.value,
        pageSize: capabilityPageSize.value
      }
    })
    capabilityRows.value = res.data.data?.list || []
    capabilityTotal.value = res.data.data?.total || 0
  } finally {
    capabilityLoading.value = false
  }
}

const fetchLocks = async () => {
  lockLoading.value = true
  try {
    const res = await axios.get('/inventory-ops/locks/list', {
      params: {
        ...lockQuery,
        page: lockPage.value,
        pageSize: lockPageSize.value
      }
    })
    lockRows.value = (res.data.data?.list || []).map(enrichByCode)
    lockTotal.value = res.data.data?.total || 0
  } finally {
    lockLoading.value = false
  }
}
const openTxDialog = () => {
  txForm.tx_type = 'INBOUND'
  txForm.source_doc_type = 'MANUAL'
  txForm.source_doc_no = ''
  txForm.warehouse_code = ''
  txForm.sku_code = ''
  txForm.batch_no = ''
  txForm.qty = 0
  txForm.adjust_qty = 0
  txForm.remark = ''
  txDialogVisible.value = true
}

const submitTx = async () => {
  txSubmitting.value = true
  try {
    const warehouseName = warehouseNameMap.value[txForm.warehouse_code] || txForm.warehouse_code
    const skuName = skuNameMap.value[txForm.sku_code] || txForm.sku_code
    await axios.post('/inventory-ops/transactions', {
      ...txForm,
      warehouse_name: warehouseName,
      sku_name: skuName,
      qty: Number(txForm.qty || 0),
      adjust_qty: Number(txForm.adjust_qty || 0)
    })
    txDialogVisible.value = false
    ElMessage.success('库存流水登记成功')
    await Promise.all([fetchTransactions(), fetchLedger(), fetchWarnings(), fetchDashboard()])
  } finally {
    txSubmitting.value = false
  }
}

const openTransferDialog = () => {
  transferForm.out_warehouse_code = ''
  transferForm.in_warehouse_code = ''
  transferForm.sku_code = ''
  transferForm.batch_no = ''
  transferForm.qty = 0
  transferForm.reason = ''
  transferDialogVisible.value = true
}

const submitTransfer = async () => {
  transferSubmitting.value = true
  try {
    await axios.post('/inventory-ops/transfers', {
      ...transferForm,
      out_warehouse_name: warehouseNameMap.value[transferForm.out_warehouse_code] || transferForm.out_warehouse_code,
      in_warehouse_name: warehouseNameMap.value[transferForm.in_warehouse_code] || transferForm.in_warehouse_code,
      sku_name: skuNameMap.value[transferForm.sku_code] || transferForm.sku_code,
      qty: Number(transferForm.qty || 0)
    })
    transferDialogVisible.value = false
    ElMessage.success('调拨单已创建')
    await Promise.all([fetchTransfers(), fetchDashboard()])
  } finally {
    transferSubmitting.value = false
  }
}

const openLedgerDetail = async (id: number) => {
  detailDrawerVisible.value = true
  detailLoading.value = true
  try {
    const res = await axios.get(`/inventory-ops/ledger/${id}`)
    currentLedgerDetail.value = res.data.data || null
  } finally {
    detailLoading.value = false
  }
}

const openTransferDetail = async (transferNo: string) => {
  transferDrawerVisible.value = true
  transferDetailLoading.value = true
  try {
    const res = await axios.get(`/inventory-ops/transfers/${transferNo}`)
    currentTransferDetail.value = enrichByCode(res.data.data?.detail || {})
    currentTransferTracks.value = res.data.data?.tracks || []
  } finally {
    transferDetailLoading.value = false
  }
}

const executeTransferAction = async (row: any, action: string) => {
  if (action === 'SUBMIT') await axios.post(`/inventory-ops/transfers/${row.transfer_no}/submit`)
  if (action === 'OUTBOUND') await axios.post(`/inventory-ops/transfers/${row.transfer_no}/outbound`)
  if (action === 'INBOUND') await axios.post(`/inventory-ops/transfers/${row.transfer_no}/inbound`)
  if (action === 'APPROVE' || action === 'REJECT') {
    const prompt = await ElMessageBox.prompt(action === 'APPROVE' ? '请输入审核意见（可选）' : '请输入驳回原因', action === 'APPROVE' ? '审核通过' : '审核驳回', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '可选'
    })
    await axios.post(`/inventory-ops/transfers/${row.transfer_no}/review`, { action, comment: prompt.value || '' })
  }
  if (action === 'CANCEL') {
    const prompt = await ElMessageBox.prompt('请输入取消原因', '取消调拨单', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '可选'
    })
    await axios.post(`/inventory-ops/transfers/${row.transfer_no}/cancel`, { reason: prompt.value || '' })
  }
  ElMessage.success('操作成功')
  await Promise.all([fetchTransfers(), fetchLedger(), fetchTransactions(), fetchWarnings(), fetchDashboard()])
}

const handleWarning = async (row: any, status: string) => {
  const prompt = await ElMessageBox.prompt('请输入处理备注（可选）', status === 'CLOSED' ? '关闭预警' : '处理预警', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputPlaceholder: '可选'
  })
  await axios.post(`/inventory-ops/warnings/${row.id}/handle`, { status, comment: prompt.value || '' })
  ElMessage.success('预警状态已更新')
  await Promise.all([fetchWarnings(), fetchDashboard()])
}

const openCapabilityDialog = (row: any) => {
  editingCapabilityId.value = Number(row.id || 0)
  capabilityForm.service_regions = (row.service_regions || []).join(',')
  capabilityForm.daily_capacity = Number(row.daily_capacity || 0)
  capabilityForm.processing_capacity = Number(row.processing_capacity || 0)
  capabilityForm.delivery_ttl_hours = Number(row.delivery_ttl_hours || 24)
  capabilityForm.supported_skus = (row.supported_skus || []).join(',')
  capabilityForm.supported_categories = (row.supported_categories || []).join(',')
  capabilityDialogVisible.value = true
}

const saveCapability = async () => {
  capabilitySubmitting.value = true
  try {
    await axios.put(`/inventory-ops/capabilities/${editingCapabilityId.value}`, {
      service_regions: capabilityForm.service_regions,
      daily_capacity: Number(capabilityForm.daily_capacity || 0),
      processing_capacity: Number(capabilityForm.processing_capacity || 0),
      delivery_ttl_hours: Number(capabilityForm.delivery_ttl_hours || 24),
      supported_skus: capabilityForm.supported_skus,
      supported_categories: capabilityForm.supported_categories
    })
    capabilityDialogVisible.value = false
    ElMessage.success('仓配能力已更新')
    await fetchCapabilities()
  } finally {
    capabilitySubmitting.value = false
  }
}

const releaseLocksByOrder = async (orderNo: string) => {
  await axios.post('/inventory-ops/locks/release-order', { order_no: orderNo, reason: 'MANUAL_RELEASE_FROM_UI' })
  ElMessage.success('锁定已释放')
  await Promise.all([fetchLocks(), fetchLedger(), fetchTransactions(), fetchWarnings(), fetchDashboard()])
}

const init = async () => {
  await fetchOptions()
  await Promise.all([fetchDashboard(), fetchLedger(), fetchTransactions(), fetchTransfers(), fetchWarnings(), fetchCapabilities(), fetchLocks()])
}

onMounted(() => {
  window.addEventListener('resize', resizeCharts)
  void init()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  trendChart?.dispose()
  transferChart?.dispose()
  warningChart?.dispose()
  trendChart = null
  transferChart = null
  warningChart = null
})
</script>

<template>
  <div class="page-card">
    <div class="page-card-header">
      <div class="page-card-title">
        <el-icon><Box /></el-icon>
        库存与仓配运营中心（第三阶段）
      </div>
      <div class="toolbar-right">
        <el-button @click="openTxDialog">登记库存流水</el-button>
        <el-button type="primary" @click="openTransferDialog">新建调拨单</el-button>
      </div>
    </div>

    <div class="ops-dashboard">
      <div class="ops-card-grid">
        <div v-for="card in overviewCards" :key="card.key" class="ops-overview-card" :class="`ops-overview-card--${card.tone}`">
          <div class="ops-overview-card__label">{{ card.label }}</div>
          <div class="ops-overview-card__value">{{ formatNumber(card.value) }}</div>
          <div class="ops-overview-card__meta">{{ card.meta }}</div>
        </div>
      </div>

      <div class="ops-flow-strip">
        <div v-for="item in todayFlowItems" :key="item.label" class="ops-flow-pill">
          <span>{{ item.label }}</span>
          <strong>{{ formatNumber(item.value) }}</strong>
        </div>
      </div>

      <div class="ops-panel-grid">
        <section class="ops-panel ops-panel--trend">
          <div class="ops-panel__header">
            <div>
              <h3>近7天库存波动</h3>
              <p>按业务日期汇总入库、出库、锁定与异常损耗</p>
            </div>
            <div class="ops-panel__badge">安全覆盖 {{ dashboard.summary.safety_cover_rate || 0 }}%</div>
          </div>
          <div ref="trendChartRef" class="ops-chart ops-chart--large"></div>
        </section>

        <section class="ops-panel">
          <div class="ops-panel__header">
            <div>
              <h3>调拨状态分布</h3>
              <p>当前仓间补位与在途结构</p>
            </div>
          </div>
          <div ref="transferChartRef" class="ops-chart"></div>
        </section>

        <section class="ops-panel">
          <div class="ops-panel__header">
            <div>
              <h3>预警级别统计</h3>
              <p>聚焦仍在流转中的风险预警</p>
            </div>
          </div>
          <div ref="warningChartRef" class="ops-chart"></div>
          <div class="ops-status-grid">
            <div v-for="item in warningStatusCards" :key="item.status" class="ops-status-card">
              <span>{{ item.label }}</span>
              <strong>{{ formatNumber(item.count || 0) }}</strong>
            </div>
          </div>
        </section>
      </div>

      <div class="ops-panel-grid ops-panel-grid--bottom">
        <section class="ops-panel">
          <div class="ops-panel__header">
            <div>
              <h3>高风险仓库</h3>
              <p>按活跃预警数和严重等级排序</p>
            </div>
          </div>
          <div class="ops-hotspot-list">
            <div v-for="item in warningHotspots" :key="item.warehouse_code" class="ops-hotspot-row">
              <div class="ops-hotspot-row__head">
                <strong>{{ item.warehouse_name }}</strong>
                <span>{{ item.count }} 条预警</span>
              </div>
              <div class="ops-hotspot-row__meta">
                <span>严重 {{ item.critical_count }}</span>
                <span>高级 {{ item.high_count }}</span>
                <span>SKU {{ item.affected_skus }}</span>
              </div>
              <div class="ops-hotspot-row__bar">
                <span :style="{ width: `${Math.max(12, Math.round((Number(item.count || 0) / maxHotspotCount) * 100))}%` }"></span>
              </div>
            </div>
          </div>
        </section>

        <section class="ops-panel">
          <div class="ops-panel__header">
            <div>
              <h3>预警类型结构</h3>
              <p>按当前未关闭预警统计风险结构</p>
            </div>
          </div>
          <div class="ops-warning-rank">
            <div v-for="item in warningTypeRanking" :key="item.type" class="ops-warning-rank__row">
              <div class="ops-warning-rank__head">
                <span>{{ item.label }}</span>
                <strong>{{ formatNumber(item.count || 0) }}</strong>
              </div>
              <div class="ops-warning-rank__track">
                <span :style="{ width: `${Math.max(item.percent || 0, item.count ? 12 : 0)}%` }"></span>
              </div>
              <div class="ops-warning-rank__meta">{{ item.percent }}%</div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="库存台账" name="ledger">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-select v-model="ledgerQuery.warehouseCode" placeholder="仓库" clearable style="width: 180px"><el-option v-for="w in options.warehouses" :key="w.warehouse_code" :label="w.warehouse_name" :value="w.warehouse_code" /></el-select>
          <el-select v-model="ledgerQuery.skuCode" placeholder="SKU" clearable style="width: 220px"><el-option v-for="s in options.skus" :key="s.sku_code" :label="`${s.sku_code} / ${s.sku_name}`" :value="s.sku_code" /></el-select>
          <el-select v-model="ledgerQuery.nearExpiry" placeholder="临期" clearable style="width: 120px"><el-option label="临期" value="1" /></el-select>
          <el-select v-model="ledgerQuery.unsellable" placeholder="不可售" clearable style="width: 120px"><el-option label="不可售" value="1" /></el-select>
          <el-input v-model="ledgerQuery.keyword" placeholder="仓库/SKU/批次" clearable style="width: 220px" />
          <el-button type="primary" @click="fetchLedger">查询</el-button>
        </div>

        <div class="stat-cards" style="margin-bottom:12px">
          <div class="stat-card"><div class="stat-card-info"><h3>{{ ledgerSummary.total_qty || 0 }}</h3><p>总库存</p></div></div>
          <div class="stat-card"><div class="stat-card-info"><h3>{{ ledgerSummary.available_qty || 0 }}</h3><p>可用库存</p></div></div>
          <div class="stat-card"><div class="stat-card-info"><h3>{{ ledgerSummary.locked_qty || 0 }}</h3><p>锁定库存</p></div></div>
          <div class="stat-card"><div class="stat-card-info"><h3>{{ ledgerSummary.in_transit_qty || 0 }}</h3><p>在途库存</p></div></div>
        </div>

        <el-table :data="ledgerRows" v-loading="ledgerLoading" border stripe>
          <el-table-column prop="warehouse_name" label="仓库" min-width="180" />
          <el-table-column prop="sku_code" label="SKU" width="150" />
          <el-table-column prop="sku_name" label="SKU名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="batch_no" label="批次" min-width="180" />
          <el-table-column prop="expiry_date" label="效期" width="120" />
          <el-table-column prop="remaining_days" label="剩余天数" width="110" align="right" />
          <el-table-column prop="total_qty" label="总量" width="100" align="right" />
          <el-table-column prop="available_qty" label="可用" width="100" align="right" />
          <el-table-column prop="locked_qty" label="锁定" width="100" align="right" />
          <el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" @click="openLedgerDetail(row.id)">明细</el-button></template></el-table-column>
        </el-table>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination v-model:current-page="ledgerPage" v-model:page-size="ledgerPageSize" layout="total, prev, pager, next" :total="ledgerTotal" @current-change="fetchLedger" /></div>
      </el-tab-pane>
      <el-tab-pane label="出入库流水" name="transactions">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-select v-model="txQuery.txType" placeholder="交易类型" clearable style="width: 180px"><el-option v-for="t in options.tx_types" :key="t" :label="t" :value="t" /></el-select>
          <el-input v-model="txQuery.keyword" placeholder="单据号/仓库/SKU" clearable style="width: 240px" />
          <el-button type="primary" @click="fetchTransactions">查询</el-button>
        </div>
        <el-table :data="txRows" v-loading="txLoading" border stripe>
          <el-table-column prop="biz_time" label="业务时间" min-width="170" />
          <el-table-column prop="tx_type" label="类型" width="130" />
          <el-table-column prop="source_doc_no" label="来源单据" min-width="160" />
          <el-table-column prop="warehouse_name" label="仓库" min-width="160" />
          <el-table-column prop="sku_name" label="SKU" min-width="180" show-overflow-tooltip />
          <el-table-column prop="batch_no" label="批次" min-width="170" />
          <el-table-column prop="qty" label="数量" width="100" align="right" />
          <el-table-column prop="operator" label="操作人" width="120" />
        </el-table>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination v-model:current-page="txPage" v-model:page-size="txPageSize" layout="total, prev, pager, next" :total="txTotal" @current-change="fetchTransactions" /></div>
      </el-tab-pane>

      <el-tab-pane label="调拨单" name="transfers">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-select v-model="transferQuery.status" placeholder="状态" clearable style="width: 180px"><el-option v-for="s in options.transfer_status" :key="s" :label="s" :value="s" /></el-select>
          <el-input v-model="transferQuery.keyword" placeholder="调拨单号/SKU/仓库" clearable style="width: 240px" />
          <el-button type="primary" @click="fetchTransfers">查询</el-button>
        </div>
        <el-table :data="transferRows" v-loading="transferLoading" border stripe>
          <el-table-column prop="transfer_no" label="调拨单号" min-width="170" />
          <el-table-column prop="out_warehouse_name" label="调出仓" min-width="150" />
          <el-table-column prop="in_warehouse_name" label="调入仓" min-width="150" />
          <el-table-column prop="sku_name" label="SKU" min-width="170" show-overflow-tooltip />
          <el-table-column prop="batch_no" label="批次" min-width="170" />
          <el-table-column prop="qty" label="数量" width="100" align="right" />
          <el-table-column prop="status" label="状态" width="140" />
          <el-table-column label="操作" min-width="280">
            <template #default="{ row }">
              <el-button link type="primary" @click="openTransferDetail(row.transfer_no)">详情</el-button>
              <el-button v-if="row.status === 'DRAFT'" link type="success" @click="executeTransferAction(row, 'SUBMIT')">提交</el-button>
              <el-button v-if="row.status === 'DRAFT' || row.status === 'PENDING_REVIEW' || row.status === 'APPROVED'" link type="danger" @click="executeTransferAction(row, 'CANCEL')">取消</el-button>
              <el-button v-if="row.status === 'PENDING_REVIEW'" link type="success" @click="executeTransferAction(row, 'APPROVE')">通过</el-button>
              <el-button v-if="row.status === 'PENDING_REVIEW'" link type="danger" @click="executeTransferAction(row, 'REJECT')">驳回</el-button>
              <el-button v-if="row.status === 'APPROVED'" link type="warning" @click="executeTransferAction(row, 'OUTBOUND')">调出确认</el-button>
              <el-button v-if="row.status === 'OUTBOUND'" link type="warning" @click="executeTransferAction(row, 'INBOUND')">调入确认</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination v-model:current-page="transferPage" v-model:page-size="transferPageSize" layout="total, prev, pager, next" :total="transferTotal" @current-change="fetchTransfers" /></div>
      </el-tab-pane>

      <el-tab-pane label="预警中心" name="warnings">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-select v-model="warningQuery.type" placeholder="预警类型" clearable style="width: 170px"><el-option v-for="t in options.warning_types" :key="t" :label="t" :value="t" /></el-select>
          <el-select v-model="warningQuery.level" placeholder="预警级别" clearable style="width: 140px"><el-option v-for="lv in options.warning_level" :key="lv" :label="lv" :value="lv" /></el-select>
          <el-select v-model="warningQuery.status" placeholder="状态" clearable style="width: 140px"><el-option v-for="st in options.warning_status" :key="st" :label="st" :value="st" /></el-select>
          <el-input v-model="warningQuery.keyword" placeholder="仓库/SKU/批次" clearable style="width: 220px" />
          <el-button type="primary" @click="fetchWarnings">查询</el-button>
        </div>
        <el-table :data="warningRows" v-loading="warningLoading" border stripe>
          <el-table-column prop="type" label="预警类型" width="140" />
          <el-table-column prop="level" label="级别" width="120" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column prop="warehouse_name" label="仓库" min-width="150" />
          <el-table-column prop="sku_name" label="SKU" min-width="180" />
          <el-table-column prop="batch_no" label="批次" min-width="170" />
          <el-table-column prop="message" label="说明" min-width="220" show-overflow-tooltip />
          <el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="primary" @click="handleWarning(row, 'PROCESSING')" :disabled="row.status === 'CLOSED'">处理中</el-button><el-button link type="success" @click="handleWarning(row, 'CLOSED')" :disabled="row.status === 'CLOSED'">关闭</el-button></template></el-table-column>
        </el-table>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination v-model:current-page="warningPage" v-model:page-size="warningPageSize" layout="total, prev, pager, next" :total="warningTotal" @current-change="fetchWarnings" /></div>
      </el-tab-pane>

      <el-tab-pane label="仓配能力" name="capability">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-input v-model="capabilityQuery.keyword" placeholder="仓库/服务区域" clearable style="width: 240px" />
          <el-button type="primary" @click="fetchCapabilities">查询</el-button>
        </div>
        <el-table :data="capabilityRows" v-loading="capabilityLoading" border stripe>
          <el-table-column prop="warehouse_name" label="仓库" min-width="170" />
          <el-table-column label="服务区域" min-width="220"><template #default="{ row }">{{ (row.service_regions || []).join(' / ') }}</template></el-table-column>
          <el-table-column prop="daily_capacity" label="日处理能力" width="130" align="right" />
          <el-table-column prop="processing_capacity" label="分拣能力" width="120" align="right" />
          <el-table-column prop="delivery_ttl_hours" label="配送时效(h)" width="120" align="right" />
          <el-table-column label="支持SKU数" width="120" align="right"><template #default="{ row }">{{ (row.supported_skus || []).length }}</template></el-table-column>
          <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="openCapabilityDialog(row)">编辑</el-button></template></el-table-column>
        </el-table>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination v-model:current-page="capabilityPage" v-model:page-size="capabilityPageSize" layout="total, prev, pager, next" :total="capabilityTotal" @current-change="fetchCapabilities" /></div>
      </el-tab-pane>

      <el-tab-pane label="锁定记录" name="locks">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-input v-model="lockQuery.orderNo" placeholder="订单号" clearable style="width: 200px" />
          <el-select v-model="lockQuery.status" placeholder="状态" clearable style="width: 140px"><el-option label="ACTIVE" value="ACTIVE" /><el-option label="RELEASED" value="RELEASED" /></el-select>
          <el-input v-model="lockQuery.keyword" placeholder="仓库/SKU/批次" clearable style="width: 220px" />
          <el-button type="primary" @click="fetchLocks">查询</el-button>
        </div>
        <el-table :data="lockRows" v-loading="lockLoading" border stripe>
          <el-table-column prop="order_no" label="订单号" min-width="170" />
          <el-table-column prop="sku_name" label="SKU" min-width="170" />
          <el-table-column prop="warehouse_name" label="仓库" min-width="150" />
          <el-table-column prop="batch_no" label="批次" min-width="170" />
          <el-table-column prop="lock_qty" label="锁定数量" width="100" align="right" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="updated_at" label="更新时间" min-width="170" />
          <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="danger" @click="releaseLocksByOrder(row.order_no)" :disabled="row.status !== 'ACTIVE'">释放订单锁定</el-button></template></el-table-column>
        </el-table>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><el-pagination v-model:current-page="lockPage" v-model:page-size="lockPageSize" layout="total, prev, pager, next" :total="lockTotal" @current-change="fetchLocks" /></div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="txDialogVisible" title="登记库存流水" width="760px" :close-on-click-modal="false">
      <div class="toolbar" style="margin-bottom: 12px">
        <el-select v-model="txForm.tx_type" placeholder="类型" style="width:160px"><el-option v-for="t in options.tx_types" :key="t" :label="t" :value="t" /></el-select>
        <el-select v-model="txForm.warehouse_code" placeholder="仓库" filterable style="width:220px"><el-option v-for="w in options.warehouses" :key="w.warehouse_code" :label="w.warehouse_name" :value="w.warehouse_code" /></el-select>
        <el-select v-model="txForm.sku_code" placeholder="SKU" filterable style="width:240px"><el-option v-for="s in options.skus" :key="s.sku_code" :label="`${s.sku_code} / ${s.sku_name}`" :value="s.sku_code" /></el-select>
      </div>
      <div class="toolbar">
        <el-input v-model="txForm.batch_no" placeholder="批次号" style="width:220px" />
        <el-input-number v-if="txForm.tx_type !== 'ADJUST'" v-model="txForm.qty" :min="0" style="width:180px" />
        <el-input-number v-else v-model="txForm.adjust_qty" style="width:180px" />
        <el-input v-model="txForm.source_doc_no" placeholder="来源单据号" style="width:220px" />
      </div>
      <el-input v-model="txForm.remark" placeholder="备注" style="margin-top: 12px" />
      <template #footer>
        <el-button @click="txDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="txSubmitting" @click="submitTx">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialogVisible" title="新建调拨单" width="760px" :close-on-click-modal="false">
      <div class="toolbar" style="margin-bottom: 12px">
        <el-select v-model="transferForm.out_warehouse_code" placeholder="调出仓" filterable style="width:220px"><el-option v-for="w in options.warehouses" :key="`out-${w.warehouse_code}`" :label="w.warehouse_name" :value="w.warehouse_code" /></el-select>
        <el-select v-model="transferForm.in_warehouse_code" placeholder="调入仓" filterable style="width:220px"><el-option v-for="w in options.warehouses" :key="`in-${w.warehouse_code}`" :label="w.warehouse_name" :value="w.warehouse_code" /></el-select>
        <el-select v-model="transferForm.sku_code" placeholder="SKU" filterable style="width:240px"><el-option v-for="s in options.skus" :key="s.sku_code" :label="`${s.sku_code} / ${s.sku_name}`" :value="s.sku_code" /></el-select>
      </div>
      <div class="toolbar">
        <el-input v-model="transferForm.batch_no" placeholder="批次号（可空，系统按FEFO）" style="width:300px" />
        <el-input-number v-model="transferForm.qty" :min="1" style="width:180px" />
        <el-input v-model="transferForm.reason" placeholder="申请原因" style="width:260px" />
      </div>
      <template #footer>
        <el-button @click="transferDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferSubmitting" @click="submitTransfer">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="capabilityDialogVisible" title="编辑仓配能力" width="760px" :close-on-click-modal="false">
      <div class="toolbar" style="margin-bottom: 12px"><el-input v-model="capabilityForm.service_regions" placeholder="服务区域，逗号分隔" style="width:100%" /></div>
      <div class="toolbar" style="margin-bottom: 12px">
        <el-input-number v-model="capabilityForm.daily_capacity" :min="0" style="width:220px" />
        <el-input-number v-model="capabilityForm.processing_capacity" :min="0" style="width:220px" />
        <el-input-number v-model="capabilityForm.delivery_ttl_hours" :min="1" style="width:220px" />
      </div>
      <div class="toolbar">
        <el-input v-model="capabilityForm.supported_skus" placeholder="支持SKU编码，逗号分隔" style="width:100%" />
      </div>
      <el-input v-model="capabilityForm.supported_categories" placeholder="支持品类编码，逗号分隔" style="margin-top:12px" />
      <template #footer>
        <el-button @click="capabilityDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="capabilitySubmitting" @click="saveCapability">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawerVisible" title="库存明细" size="60%" :destroy-on-close="true">
      <div v-loading="detailLoading" v-if="currentLedgerDetail?.detail">
        <div class="toolbar" style="margin-bottom:12px">
          <el-tag>{{ currentLedgerDetail.detail.warehouse_name }}</el-tag>
          <el-tag type="success">{{ currentLedgerDetail.detail.sku_name }}</el-tag>
          <el-tag type="warning">{{ currentLedgerDetail.detail.batch_no }}</el-tag>
        </div>
        <el-table :data="currentLedgerDetail.changes || []" border>
          <el-table-column prop="biz_time" label="业务时间" min-width="170" />
          <el-table-column prop="tx_type" label="类型" width="120" />
          <el-table-column prop="source_doc_no" label="来源单据" min-width="150" />
          <el-table-column prop="qty" label="数量" width="100" align="right" />
          <el-table-column prop="before_available_qty" label="变更前可用" width="110" align="right" />
          <el-table-column prop="after_available_qty" label="变更后可用" width="110" align="right" />
          <el-table-column prop="operator" label="操作人" width="120" />
        </el-table>
      </div>
    </el-drawer>

    <el-drawer v-model="transferDrawerVisible" title="调拨单详情" size="60%" :destroy-on-close="true">
      <div v-loading="transferDetailLoading" v-if="currentTransferDetail?.transfer_no">
        <div class="toolbar" style="margin-bottom:12px">
          <el-tag type="primary">{{ currentTransferDetail.transfer_no }}</el-tag>
          <el-tag>{{ currentTransferDetail.status }}</el-tag>
          <el-tag type="warning">{{ currentTransferDetail.sku_name }}</el-tag>
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="调出仓">{{ currentTransferDetail.out_warehouse_name }}</el-descriptions-item>
          <el-descriptions-item label="调入仓">{{ currentTransferDetail.in_warehouse_name }}</el-descriptions-item>
          <el-descriptions-item label="批次">{{ currentTransferDetail.batch_no }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ currentTransferDetail.qty }}</el-descriptions-item>
          <el-descriptions-item label="申请原因" :span="2">{{ currentTransferDetail.reason || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <el-table :data="currentTransferTracks" border>
          <el-table-column prop="action_time" label="时间" min-width="170" />
          <el-table-column prop="status" label="状态" width="140" />
          <el-table-column prop="operator" label="操作人" width="120" />
          <el-table-column prop="comment" label="说明" min-width="220" show-overflow-tooltip />
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.ops-dashboard {
  margin-bottom: 20px;
}

.ops-card-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.ops-overview-card {
  border-radius: 18px;
  padding: 18px 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(160deg, #ffffff 0%, #f7fafc 100%);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
}

.ops-overview-card--slate {
  background: linear-gradient(160deg, #f8fafc 0%, #eef2ff 100%);
}

.ops-overview-card--emerald {
  background: linear-gradient(160deg, #ecfdf5 0%, #d1fae5 100%);
}

.ops-overview-card--blue {
  background: linear-gradient(160deg, #eff6ff 0%, #dbeafe 100%);
}

.ops-overview-card--amber {
  background: linear-gradient(160deg, #fffbeb 0%, #fde68a 100%);
}

.ops-overview-card--rose {
  background: linear-gradient(160deg, #fff1f2 0%, #ffe4e6 100%);
}

.ops-overview-card--violet {
  background: linear-gradient(160deg, #f5f3ff 0%, #ede9fe 100%);
}

.ops-overview-card__label {
  font-size: 13px;
  color: #475569;
  margin-bottom: 12px;
}

.ops-overview-card__value {
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
  color: #0f172a;
}

.ops-overview-card__meta {
  margin-top: 10px;
  font-size: 12px;
  color: #64748b;
}

.ops-flow-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.ops-flow-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e2e8f0;
  color: #475569;
}

.ops-flow-pill strong {
  color: #0f172a;
  font-size: 16px;
}

.ops-panel-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.ops-panel-grid--bottom {
  grid-template-columns: 1.2fr 1fr;
}

.ops-panel {
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 16px;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
}

.ops-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.ops-panel__header h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.ops-panel__header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}

.ops-panel__badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: #ecfeff;
  color: #155e75;
  font-size: 12px;
  white-space: nowrap;
}

.ops-chart {
  width: 100%;
  height: 250px;
}

.ops-chart--large {
  height: 320px;
}

.ops-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.ops-status-card {
  padding: 12px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.ops-status-card span {
  display: block;
  font-size: 12px;
  color: #64748b;
}

.ops-status-card strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  color: #0f172a;
}

.ops-hotspot-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ops-hotspot-row {
  padding: 12px 14px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.ops-hotspot-row__head,
.ops-warning-rank__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.ops-hotspot-row__head strong,
.ops-warning-rank__head strong {
  color: #0f172a;
}

.ops-hotspot-row__head span,
.ops-warning-rank__meta {
  font-size: 12px;
  color: #64748b;
}

.ops-hotspot-row__meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 8px 0;
  font-size: 12px;
  color: #475569;
}

.ops-hotspot-row__bar,
.ops-warning-rank__track {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.ops-hotspot-row__bar span,
.ops-warning-rank__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.ops-hotspot-row__bar span {
  background: linear-gradient(90deg, #fb7185 0%, #f97316 100%);
}

.ops-warning-rank {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ops-warning-rank__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 10px;
  align-items: center;
}

.ops-warning-rank__row .ops-warning-rank__head {
  grid-column: 1 / span 2;
}

.ops-warning-rank__track span {
  background: linear-gradient(90deg, #2563eb 0%, #14b8a6 100%);
}

@media (max-width: 1400px) {
  .ops-card-grid,
  .ops-flow-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ops-panel-grid {
    grid-template-columns: 1fr;
  }

  .ops-panel-grid--bottom {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .ops-card-grid,
  .ops-flow-strip,
  .ops-status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ops-overview-card__value {
    font-size: 24px;
  }

  .ops-chart,
  .ops-chart--large {
    height: 260px;
  }
}
</style>
