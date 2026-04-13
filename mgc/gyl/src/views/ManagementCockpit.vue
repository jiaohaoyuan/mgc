<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const loading = ref(false)
const activeTab = ref('order')

const optionState = reactive<any>({
  report_period_types: [],
  report_status: []
})

const overview = reactive<any>({
  order_scale: { order_count: 0, total_amount: 0, total_qty: 0 },
  fulfillment_rate: 0,
  inventory_health_score: 0,
  exception_count: 0,
  channel_contribution: [],
  region_performance: []
})

const orderAnalysis = reactive<any>({
  totals: { order_count: 0, total_amount: 0, total_qty: 0 },
  by_region: [],
  by_channel: [],
  review_pass_rate: 0,
  allocation_success_rate: 0,
  fulfillment_rate: 0,
  exception_order_count: 0,
  exception_order_ratio: 0,
  recent_documents: []
})

const inventoryAnalysis = reactive<any>({
  summary: {
    total_qty: 0,
    available_qty: 0,
    near_expiry_qty: 0,
    turnover_days: 0,
    near_expiry_ratio: 0,
    stockout_sku_count: 0,
    open_warning_count: 0
  },
  warehouse_load: [],
  warning_summary: [],
  transfer_summary: [],
  recent_transfer_documents: []
})

const channelAnalysis = reactive<any>({
  channel_structure: [],
  dealer_ranking: [],
  region_performance: [],
  authorization_execution: {
    active_authorization_count: 0,
    expired_authorization_count: 0,
    covered_order_count: 0,
    total_order_count: 0,
    execution_rate: 0
  },
  recent_order_documents: []
})

const mdmQuality = reactive<any>({
  data_error_rate: 0,
  conflict_count: 0,
  expiring_soon_count: 0,
  approval_backlog_count: 0,
  issue_by_severity: [],
  request_status: [],
  pending_request_documents: []
})

const reportQuery = reactive<any>({ periodType: '', status: '', keyword: '' })
const reportRows = ref<any[]>([])
const reportPage = ref(1)
const reportPageSize = ref(10)
const reportTotal = ref(0)
const reportLoading = ref(false)
const reportGenerating = ref(false)
const reportBatchGenerating = ref(false)

const snapshotDialogVisible = ref(false)
const snapshotLoading = ref(false)
const currentSnapshotReport = ref<any>(null)
const snapshotData = reactive<any>({ overview: {}, order_analysis: {}, inventory_analysis: {}, channel_analysis: {}, mdm_quality: {} })

const channelChartRef = ref<HTMLDivElement>()
const regionChartRef = ref<HTMLDivElement>()
let channelChart: echarts.ECharts | null = null
let regionChart: echarts.ECharts | null = null

const formatNumber = (value: number | string) => Number(value || 0).toLocaleString('zh-CN')
const formatPercent = (value: number | string) => `${Number(value || 0).toFixed(2)}%`

const summaryCards = computed(() => [
  { label: '订单规模', value: formatNumber(overview.order_scale?.order_count || 0), meta: `总量 ${formatNumber(overview.order_scale?.total_qty || 0)} · 金额 ${formatNumber(overview.order_scale?.total_amount || 0)}` },
  { label: '履约率', value: formatPercent(overview.fulfillment_rate || 0), meta: '订单闭环执行水平' },
  { label: '库存健康度', value: Number(overview.inventory_health_score || 0).toFixed(2), meta: '可用库存与临期库存综合评分' },
  { label: '异常总量', value: formatNumber(overview.exception_count || 0), meta: '订单 + 库存 + 主数据异常' }
])

const isLinkRow = (row: any) => Boolean(row?.link_path && String(row.link_path).startsWith('/'))
const clickableRowClassName = ({ row }: { row: any }) => (isLinkRow(row) ? 'clickable-row' : '')
const jumpByRow = (row: any) => {
  if (!isLinkRow(row)) return
  void router.push(String(row.link_path))
}

const ensureCharts = () => {
  if (!channelChart && channelChartRef.value) channelChart = echarts.init(channelChartRef.value)
  if (!regionChart && regionChartRef.value) regionChart = echarts.init(regionChartRef.value)
}

const renderCharts = () => {
  ensureCharts()
  const channelRows = Array.isArray(overview.channel_contribution) ? overview.channel_contribution : []
  const regionRows = Array.isArray(overview.region_performance) ? overview.region_performance : []

  channelChart?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 26, left: 44, right: 16, bottom: 34 },
    xAxis: { type: 'category', data: channelRows.map((row: any) => row.channel || '-') },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: channelRows.map((row: any) => Number(row.total_amount || 0)), barMaxWidth: 28, itemStyle: { color: '#2563eb' } }]
  })

  regionChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { top: 36, left: 44, right: 16, bottom: 30 },
    xAxis: { type: 'category', data: regionRows.map((row: any) => row.region || '-') },
    yAxis: { type: 'value' },
    series: [
      { name: '订单数', type: 'bar', data: regionRows.map((row: any) => Number(row.order_count || 0)), barMaxWidth: 24 },
      { name: '销售额', type: 'line', smooth: true, data: regionRows.map((row: any) => Number(row.total_amount || 0)) }
    ]
  })
}

const fetchOptions = async () => { const res = await axios.get('/management-cockpit/options'); Object.assign(optionState, res.data?.data || {}) }
const fetchOverview = async () => { const res = await axios.get('/management-cockpit/overview'); Object.assign(overview, res.data?.data || {}); await nextTick(); renderCharts() }
const fetchOrderAnalysis = async () => { const res = await axios.get('/management-cockpit/order-analysis'); Object.assign(orderAnalysis, res.data?.data || {}) }
const fetchInventoryAnalysis = async () => { const res = await axios.get('/management-cockpit/inventory-analysis'); Object.assign(inventoryAnalysis, res.data?.data || {}) }
const fetchChannelAnalysis = async () => { const res = await axios.get('/management-cockpit/channel-analysis'); Object.assign(channelAnalysis, res.data?.data || {}) }
const fetchMdmQuality = async () => { const res = await axios.get('/management-cockpit/mdm-quality'); Object.assign(mdmQuality, res.data?.data || {}) }

const fetchReports = async () => {
  reportLoading.value = true
  try {
    const res = await axios.get('/management-cockpit/reports', {
      params: {
        periodType: reportQuery.periodType,
        status: reportQuery.status,
        keyword: reportQuery.keyword,
        page: reportPage.value,
        pageSize: reportPageSize.value
      }
    })
    reportRows.value = res.data?.data?.list || []
    reportTotal.value = Number(res.data?.data?.total || 0)
  } finally {
    reportLoading.value = false
  }
}

const openSnapshot = async (row: any) => {
  snapshotDialogVisible.value = true
  snapshotLoading.value = true
  currentSnapshotReport.value = row
  try {
    const res = await axios.get(`/management-cockpit/reports/${row.id}/snapshot`)
    Object.assign(snapshotData, { overview: {}, order_analysis: {}, inventory_analysis: {}, channel_analysis: {}, mdm_quality: {} }, res.data?.data || {})
  } finally {
    snapshotLoading.value = false
  }
}

const generateReport = async (periodType: string) => {
  reportGenerating.value = true
  try {
    await axios.post('/management-cockpit/reports/generate', { periodType })
    ElMessage.success('报表生成成功')
    reportPage.value = 1
    await fetchReports()
  } finally {
    reportGenerating.value = false
  }
}

const generateBatchReports = async () => {
  await ElMessageBox.confirm('将自动生成日报、周报、月报，是否继续？', '批量生成确认', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  })

  reportBatchGenerating.value = true
  try {
    const res = await axios.post('/management-cockpit/reports/generate-batch', { periodTypes: ['DAILY', 'WEEKLY', 'MONTHLY'] })
    const total = Number(res.data?.data?.total || 0)
    ElMessage.success(`批量生成成功，共 ${total} 份报表`)
    reportPage.value = 1
    await fetchReports()
  } finally {
    reportBatchGenerating.value = false
  }
}

const exportReport = async (row: any) => {
  const res = await axios.get(`/management-cockpit/reports/${row.id}/export`)
  const data = res.data?.data || {}
  const content = String(data.content || '')
  if (!content) return ElMessage.warning('导出内容为空')

  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = data.file_name || `${row.report_no || 'report'}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
  ElMessage.success('报表导出成功')
}

const archiveReport = async (row: any) => {
  if (row.status === 'ARCHIVED') return ElMessage.info('当前报表已留档')
  await ElMessageBox.confirm(`确定将报表 ${row.report_no} 留档吗？`, '留档确认', {
    confirmButtonText: '确认留档',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await axios.post(`/management-cockpit/reports/${row.id}/archive`)
  ElMessage.success('留档成功')
  await fetchReports()
}

const queryReports = async () => { reportPage.value = 1; await fetchReports() }

const loadAll = async () => {
  loading.value = true
  try {
    await Promise.all([fetchOptions(), fetchOverview(), fetchOrderAnalysis(), fetchInventoryAnalysis(), fetchChannelAnalysis(), fetchMdmQuality()])
    await fetchReports()
  } catch {
    ElMessage.error('驾驶舱数据加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

const resizeCharts = () => { channelChart?.resize(); regionChart?.resize() }

onMounted(async () => {
  await loadAll()
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  channelChart?.dispose()
  regionChart?.dispose()
})
</script>

<template>
  <div v-loading="loading">
    <div class="card-grid">
      <div v-for="card in summaryCards" :key="card.label" class="summary-card">
        <div class="summary-label">{{ card.label }}</div>
        <div class="summary-value">{{ card.value }}</div>
        <div class="summary-meta">{{ card.meta }}</div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="panel">
        <div class="panel-title">渠道贡献金额</div>
        <div ref="channelChartRef" class="chart"></div>
      </div>
      <div class="panel">
        <div class="panel-title">区域经营表现</div>
        <div ref="regionChartRef" class="chart"></div>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="订单分析看板" name="order">
        <el-descriptions :column="5" border>
          <el-descriptions-item label="订单数">{{ formatNumber(orderAnalysis.totals?.order_count || 0) }}</el-descriptions-item>
          <el-descriptions-item label="订单总量">{{ formatNumber(orderAnalysis.totals?.total_qty || 0) }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">{{ formatNumber(orderAnalysis.totals?.total_amount || 0) }}</el-descriptions-item>
          <el-descriptions-item label="审核通过率">{{ formatPercent(orderAnalysis.review_pass_rate || 0) }}</el-descriptions-item>
          <el-descriptions-item label="分配成功率">{{ formatPercent(orderAnalysis.allocation_success_rate || 0) }}</el-descriptions-item>
        </el-descriptions>

        <div class="two-col">
          <el-card>
            <template #header>按区域统计（点击跳转单据）</template>
            <el-table :data="orderAnalysis.by_region || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="region" label="区域" min-width="120" />
              <el-table-column prop="order_count" label="订单数" align="right" width="100" />
              <el-table-column prop="total_qty" label="总量" align="right" width="110" />
              <el-table-column prop="total_amount" label="金额" align="right" min-width="120" />
              <el-table-column prop="share_rate" label="占比(%)" align="right" width="110" />
            </el-table>
          </el-card>

          <el-card>
            <template #header>按渠道统计（点击跳转单据）</template>
            <el-table :data="orderAnalysis.by_channel || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="channel" label="渠道" min-width="120" />
              <el-table-column prop="order_count" label="订单数" align="right" width="100" />
              <el-table-column prop="total_qty" label="总量" align="right" width="110" />
              <el-table-column prop="total_amount" label="金额" align="right" min-width="120" />
              <el-table-column prop="share_rate" label="占比(%)" align="right" width="110" />
            </el-table>
          </el-card>
        </div>

        <el-card style="margin-top: 12px;">
          <template #header>订单单据明细（点击进入详情页）</template>
          <el-table :data="orderAnalysis.recent_documents || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
            <el-table-column prop="order_no" label="订单号" min-width="170" />
            <el-table-column prop="customer_name" label="客户" min-width="160" />
            <el-table-column prop="order_status" label="订单状态" width="120" />
            <el-table-column prop="fulfillment_status" label="履约状态" width="120" />
            <el-table-column prop="total_qty" label="总量" width="100" align="right" />
            <el-table-column prop="total_amount" label="金额" width="120" align="right" />
            <el-table-column prop="created_at" label="时间" min-width="170" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="库存分析看板" name="inventory">
        <el-descriptions :column="4" border>
          <el-descriptions-item label="周转天数">{{ inventoryAnalysis.summary?.turnover_days || 0 }}</el-descriptions-item>
          <el-descriptions-item label="临期库存比例">{{ formatPercent(inventoryAnalysis.summary?.near_expiry_ratio || 0) }}</el-descriptions-item>
          <el-descriptions-item label="缺货SKU">{{ inventoryAnalysis.summary?.stockout_sku_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="未关闭预警">{{ inventoryAnalysis.summary?.open_warning_count || 0 }}</el-descriptions-item>
        </el-descriptions>

        <div class="two-col">
          <el-card>
            <template #header>仓库负载情况（点击跳转调拨详情）</template>
            <el-table :data="inventoryAnalysis.warehouse_load || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="warehouse" label="仓库" min-width="140" />
              <el-table-column prop="total_qty" label="总库存" align="right" width="110" />
              <el-table-column prop="available_qty" label="可用库存" align="right" width="120" />
              <el-table-column prop="near_expiry_qty" label="临期库存" align="right" width="120" />
              <el-table-column prop="load_rate" label="负载率(%)" align="right" width="110" />
            </el-table>
          </el-card>

          <el-card>
            <template #header>调拨状态（点击跳转调拨详情）</template>
            <el-table :data="inventoryAnalysis.transfer_summary || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="status" label="调拨状态" min-width="120" />
              <el-table-column prop="count" label="数量" align="right" width="100" />
              <el-table-column prop="sample_transfer_no" label="样例调拨单" min-width="160" />
            </el-table>
          </el-card>
        </div>

        <el-card style="margin-top: 12px;">
          <template #header>调拨单据明细（点击进入详情页）</template>
          <el-table :data="inventoryAnalysis.recent_transfer_documents || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
            <el-table-column prop="transfer_no" label="调拨单号" min-width="170" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column prop="out_warehouse_name" label="调出仓" min-width="130" />
            <el-table-column prop="in_warehouse_name" label="调入仓" min-width="130" />
            <el-table-column prop="sku_name" label="SKU" min-width="140" />
            <el-table-column prop="qty" label="数量" width="90" align="right" />
            <el-table-column prop="updated_at" label="更新时间" min-width="160" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="渠道经销商分析" name="channel">
        <el-descriptions :column="5" border>
          <el-descriptions-item label="有效授权">{{ channelAnalysis.authorization_execution?.active_authorization_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="失效授权">{{ channelAnalysis.authorization_execution?.expired_authorization_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="覆盖订单">{{ channelAnalysis.authorization_execution?.covered_order_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总订单">{{ channelAnalysis.authorization_execution?.total_order_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="执行率">{{ formatPercent(channelAnalysis.authorization_execution?.execution_rate || 0) }}</el-descriptions-item>
        </el-descriptions>

        <div class="three-col">
          <el-card>
            <template #header>渠道结构（点击跳转单据）</template>
            <el-table :data="channelAnalysis.channel_structure || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="channel" label="渠道" min-width="120" />
              <el-table-column prop="order_count" label="订单数" align="right" width="90" />
              <el-table-column prop="total_amount" label="销售额" align="right" min-width="110" />
              <el-table-column prop="share_rate" label="占比(%)" align="right" width="90" />
            </el-table>
          </el-card>

          <el-card>
            <template #header>经销商排行（点击跳转单据）</template>
            <el-table :data="channelAnalysis.dealer_ranking || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="reseller_name" label="经销商" min-width="140" />
              <el-table-column prop="order_count" label="订单数" align="right" width="90" />
              <el-table-column prop="total_amount" label="销售额" align="right" min-width="110" />
            </el-table>
          </el-card>

          <el-card>
            <template #header>区域表现（点击跳转单据）</template>
            <el-table :data="channelAnalysis.region_performance || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="region" label="区域" min-width="120" />
              <el-table-column prop="order_count" label="订单数" align="right" width="90" />
              <el-table-column prop="total_qty" label="销量" align="right" width="90" />
              <el-table-column prop="total_amount" label="销售额" align="right" min-width="110" />
            </el-table>
          </el-card>
        </div>

        <el-card style="margin-top: 12px;">
          <template #header>渠道相关订单（点击进入详情页）</template>
          <el-table :data="channelAnalysis.recent_order_documents || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
            <el-table-column prop="order_no" label="订单号" min-width="170" />
            <el-table-column prop="reseller_name" label="经销商" min-width="160" />
            <el-table-column prop="channel_name" label="渠道" min-width="130" />
            <el-table-column prop="region" label="区域" width="110" />
            <el-table-column prop="total_qty" label="总量" width="90" align="right" />
            <el-table-column prop="total_amount" label="金额" width="120" align="right" />
            <el-table-column prop="created_at" label="时间" min-width="160" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="主数据质量看板" name="mdm">
        <el-descriptions :column="4" border>
          <el-descriptions-item label="数据错误率">{{ formatPercent(mdmQuality.data_error_rate || 0) }}</el-descriptions-item>
          <el-descriptions-item label="冲突数量">{{ mdmQuality.conflict_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="即将失效数">{{ mdmQuality.expiring_soon_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="审批积压数">{{ mdmQuality.approval_backlog_count || 0 }}</el-descriptions-item>
        </el-descriptions>

        <div class="two-col">
          <el-card>
            <template #header>问题严重度分布</template>
            <el-table :data="mdmQuality.issue_by_severity || []" size="small" border>
              <el-table-column prop="severity" label="严重度" min-width="120" />
              <el-table-column prop="count" label="数量" align="right" width="100" />
            </el-table>
          </el-card>

          <el-card>
            <template #header>变更请求状态（点击跳转单据）</template>
            <el-table :data="mdmQuality.request_status || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
              <el-table-column prop="status" label="状态" min-width="120" />
              <el-table-column prop="count" label="数量" align="right" width="100" />
              <el-table-column prop="sample_request_no" label="样例申请单" min-width="170" />
            </el-table>
          </el-card>
        </div>

        <el-card style="margin-top: 12px;">
          <template #header>主数据申请单明细（点击进入详情页）</template>
          <el-table :data="mdmQuality.pending_request_documents || []" size="small" border :row-class-name="clickableRowClassName" @row-click="jumpByRow">
            <el-table-column prop="request_no" label="申请单号" min-width="170" />
            <el-table-column prop="object_type" label="对象" width="100" />
            <el-table-column prop="action" label="动作" width="100" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column prop="target_code" label="目标编码" min-width="130" />
            <el-table-column prop="updated_at" label="更新时间" min-width="170" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="专题报表中心" name="report">
        <div class="toolbar">
          <el-select v-model="reportQuery.periodType" placeholder="周期类型" clearable style="width: 140px">
            <el-option v-for="item in optionState.report_period_types || []" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="reportQuery.status" placeholder="报表状态" clearable style="width: 140px">
            <el-option v-for="item in optionState.report_status || []" :key="item" :label="item" :value="item" />
          </el-select>
          <el-input v-model="reportQuery.keyword" placeholder="报表编号/周期/生成人" clearable style="width: 240px" />
          <el-button type="primary" @click="queryReports">查询</el-button>
          <el-button :loading="reportGenerating" @click="generateReport('DAILY')">生成日报</el-button>
          <el-button :loading="reportGenerating" @click="generateReport('WEEKLY')">生成周报</el-button>
          <el-button :loading="reportGenerating" @click="generateReport('MONTHLY')">生成月报</el-button>
          <el-button type="warning" :loading="reportBatchGenerating" @click="generateBatchReports">自动批量生成(日/周/月)</el-button>
        </div>

        <el-table :data="reportRows" v-loading="reportLoading" border stripe>
          <el-table-column prop="report_no" label="报表编号" min-width="150" />
          <el-table-column prop="period_type" label="周期类型" width="100" />
          <el-table-column prop="period_label" label="周期标识" min-width="170" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column prop="generated_by" label="生成人" width="110" />
          <el-table-column prop="generated_at" label="生成时间" min-width="170" />
          <el-table-column prop="archived_at" label="留档时间" min-width="170" />
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openSnapshot(row)">快照</el-button>
              <el-button link type="success" @click="exportReport(row)">导出</el-button>
              <el-button link type="warning" @click="archiveReport(row)">留档</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination v-model:current-page="reportPage" v-model:page-size="reportPageSize" layout="total, prev, pager, next" :total="reportTotal" @current-change="fetchReports" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="snapshotDialogVisible" title="报表快照详情" width="980px">
      <el-skeleton v-if="snapshotLoading" :rows="8" animated />
      <template v-else>
        <el-alert type="info" :closable="false" style="margin-bottom: 12px;" :title="`报表：${currentSnapshotReport?.report_no || '-'} ｜ 周期：${currentSnapshotReport?.period_type || '-'} ｜ 标识：${currentSnapshotReport?.period_label || '-'}`" />
        <el-descriptions :column="4" border>
          <el-descriptions-item label="订单数">{{ formatNumber(snapshotData.overview?.order_scale?.order_count || 0) }}</el-descriptions-item>
          <el-descriptions-item label="履约率">{{ formatPercent(snapshotData.overview?.fulfillment_rate || 0) }}</el-descriptions-item>
          <el-descriptions-item label="库存健康度">{{ Number(snapshotData.overview?.inventory_health_score || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="异常总量">{{ formatNumber(snapshotData.overview?.exception_count || 0) }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.summary-card { border: 1px solid #dbe5f1; border-radius: 12px; padding: 14px; background: linear-gradient(145deg, #ffffff 0%, #f4f8ff 100%); }
.summary-label { color: #64748b; font-size: 13px; }
.summary-value { margin-top: 8px; font-size: 25px; font-weight: 700; color: #0f172a; }
.summary-meta { margin-top: 8px; font-size: 12px; color: #475569; }
.chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.panel { border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; padding: 12px; }
.panel-title { color: #0f172a; font-weight: 600; margin-bottom: 8px; }
.chart { height: 280px; width: 100%; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; }
.two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.three-col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
:deep(.clickable-row > td) { cursor: pointer; }
:deep(.clickable-row:hover > td) { background-color: #f0f7ff !important; }

@media (max-width: 1440px) {
  .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-grid { grid-template-columns: 1fr; }
  .three-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .two-col,
  .three-col { grid-template-columns: 1fr; }
}
</style>
