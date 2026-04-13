<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'

const activeTab = ref('profiles')

const options = reactive<any>({
  enums: {},
  regions: [],
  resellers: [],
  skus: [],
  channels: [],
  warehouses: []
})

const dashboard = reactive<any>({
  summary: {},
  trend: [],
  region_sales: [],
  channel_structure: [],
  risk_distribution: [],
  top_dealers: []
})

const trendChartRef = ref<HTMLDivElement>()
const riskChartRef = ref<HTMLDivElement>()
let trendChart: echarts.ECharts | null = null
let riskChart: echarts.ECharts | null = null

const profileQuery = reactive<any>({ keyword: '', region: '' })
const profileRows = ref<any[]>([])
const profileTotal = ref(0)
const profilePage = ref(1)
const profilePageSize = ref(10)
const profileLoading = ref(false)
const profileDialogVisible = ref(false)
const profileSubmitting = ref(false)
const profileForm = reactive<any>({
  reseller_code: '',
  reseller_name: '',
  sale_region_name: '',
  lv2_channel_code: '',
  sales_scope: '',
  contact_name: '',
  contact_mobile: '',
  owner_name: '',
  credit_level: 'B',
  default_warehouse_code: '',
  settlement_type: '月结30天',
  payment_term_days: 30,
  status: 1
})

const authQuery = reactive<any>({ keyword: '', region: '', channelType: '', status: '' })
const authRows = ref<any[]>([])
const authTotal = ref(0)
const authPage = ref(1)
const authPageSize = ref(10)
const authLoading = ref(false)
const authDialogVisible = ref(false)
const authSubmitting = ref(false)
const authForm = reactive<any>({ reseller_code: '', sku_code: '', region: '', channel_type: 'DIST', begin_date: '', end_date: '', price_grade: 'B', quota_cases: 0 })
const overreachDialogVisible = ref(false)
const overreachRows = ref<any[]>([])

const contractQuery = reactive<any>({ keyword: '', cooperationStatus: '', renewStatus: '', nearExpiry: '' })
const contractRows = ref<any[]>([])
const contractTotal = ref(0)
const contractPage = ref(1)
const contractPageSize = ref(10)
const contractLoading = ref(false)
const contractDialogVisible = ref(false)
const editingContractId = ref(0)
const contractSubmitting = ref(false)
const contractForm = reactive<any>({ reseller_code: '', contract_no: '', contract_type: '年度框架', start_date: '', end_date: '', cooperation_status: 'COOPERATING', renew_status: 'NONE', reminder_days: 30 })
const contractHistoryDialogVisible = ref(false)
const contractHistoryLoading = ref(false)
const contractHistoryRows = ref<any[]>([])
const contractHistoryTitle = ref('')

const priceQuery = reactive<any>({ keyword: '', approveStatus: '', priceGrade: '' })
const priceRows = ref<any[]>([])
const priceTotal = ref(0)
const pricePage = ref(1)
const pricePageSize = ref(10)
const priceLoading = ref(false)
const priceDialogVisible = ref(false)
const priceSubmitting = ref(false)
const priceForm = reactive<any>({ reseller_code: '', sku_code: '', channel_code: '', price_grade: 'B', price_value: 0, effective_begin: '', effective_end: '' })

const analysisDateRange = ref<string[]>([])
const analysisLoading = ref(false)
const analysis = reactive<any>({ summary: {}, region_sales: [], dealer_ranking: [], channel_structure: [], sku_structure: [] })

const riskQuery = reactive<any>({ keyword: '', riskType: '', riskLevel: '', status: '' })
const riskRows = ref<any[]>([])
const riskTotal = ref(0)
const riskPage = ref(1)
const riskPageSize = ref(10)
const riskLoading = ref(false)
const riskDetailDialogVisible = ref(false)
const riskDetailLoading = ref(false)
const riskDetail = reactive<any>({ detail: null, followups: [] })

const formatNumber = (v: number | string) => Number(v || 0).toLocaleString('zh-CN')

const summaryCards = computed(() => [
  { label: '经销商档案', value: dashboard.summary.profile_count || 0, meta: '经营对象总数' },
  { label: '有效授权', value: dashboard.summary.active_authorization_count || 0, meta: `超授权 ${dashboard.summary.overreach_count || 0}` },
  { label: '30天销量(箱)', value: dashboard.summary.total_sales_qty_30d || 0, meta: `环比 ${dashboard.summary.sales_growth_rate || 0}%` },
  { label: '待审批价格', value: dashboard.summary.pending_price_count || 0, meta: `风险处理中 ${dashboard.summary.risk_processing_count || 0}` },
  { label: '合同临近到期', value: dashboard.summary.expiring_contract_count || 0, meta: '30天内到期' },
  { label: '未关闭风险', value: dashboard.summary.risk_open_count || 0, meta: '需持续跟进' }
])

const ensureCharts = () => {
  if (trendChartRef.value && !trendChart) trendChart = echarts.init(trendChartRef.value)
  if (riskChartRef.value && !riskChart) riskChart = echarts.init(riskChartRef.value)
}

const renderCharts = () => {
  ensureCharts()

  trendChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 40, right: 16, top: 38, bottom: 24 },
    xAxis: { type: 'category', data: (dashboard.trend || []).map((row: any) => row.month) },
    yAxis: { type: 'value' },
    series: [
      { name: '销量(箱)', type: 'bar', data: (dashboard.trend || []).map((row: any) => Number(row.qty || 0)), barMaxWidth: 24 },
      { name: '销售额', type: 'line', smooth: true, data: (dashboard.trend || []).map((row: any) => Number(row.amount || 0)) }
    ]
  })

  riskChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      name: '风险分布',
      type: 'pie',
      radius: ['40%', '68%'],
      data: (dashboard.risk_distribution || []).map((row: any) => ({ name: row.type, value: Number(row.count || 0) }))
    }]
  })
}

const fetchOptions = async () => {
  const res = await axios.get('/channel-dealer-ops/options')
  Object.assign(options, res.data.data || {})
}

const fetchDashboard = async () => {
  const res = await axios.get('/channel-dealer-ops/dashboard')
  Object.assign(dashboard, res.data.data || {})
  await nextTick()
  renderCharts()
}

const fetchProfiles = async () => {
  profileLoading.value = true
  try {
    const res = await axios.get('/channel-dealer-ops/profiles/list', { params: { ...profileQuery, page: profilePage.value, pageSize: profilePageSize.value } })
    profileRows.value = res.data.data?.list || []
    profileTotal.value = res.data.data?.total || 0
  } finally {
    profileLoading.value = false
  }
}

const openProfileDialog = (row: any) => {
  Object.assign(profileForm, {
    reseller_code: row.reseller_code,
    reseller_name: row.reseller_name,
    sale_region_name: row.sale_region_name,
    lv2_channel_code: row.lv2_channel_code,
    sales_scope: row.sales_scope,
    contact_name: row.contact_name,
    contact_mobile: row.contact_mobile,
    owner_name: row.owner_name,
    credit_level: row.credit_level || 'B',
    default_warehouse_code: row.default_warehouse_code,
    settlement_type: row.settlement_type || '月结30天',
    payment_term_days: Number(row.payment_term_days || 0),
    status: Number(row.status ?? 1) === 0 ? 0 : 1
  })
  profileDialogVisible.value = true
}

const saveProfile = async () => {
  profileSubmitting.value = true
  try {
    await axios.put(`/channel-dealer-ops/profiles/${profileForm.reseller_code}`, {
      sale_region_name: profileForm.sale_region_name,
      lv2_channel_code: profileForm.lv2_channel_code,
      sales_scope: profileForm.sales_scope,
      contact_name: profileForm.contact_name,
      contact_mobile: profileForm.contact_mobile,
      owner_name: profileForm.owner_name,
      credit_level: profileForm.credit_level,
      default_warehouse_code: profileForm.default_warehouse_code,
      settlement_type: profileForm.settlement_type,
      payment_term_days: Number(profileForm.payment_term_days || 0),
      status: Number(profileForm.status) === 0 ? 0 : 1
    })
    profileDialogVisible.value = false
    ElMessage.success('档案更新成功')
    await Promise.all([fetchProfiles(), fetchDashboard()])
  } finally {
    profileSubmitting.value = false
  }
}

const fetchAuthorizations = async () => {
  authLoading.value = true
  try {
    const res = await axios.get('/channel-dealer-ops/authorizations/list', { params: { ...authQuery, page: authPage.value, pageSize: authPageSize.value } })
    authRows.value = res.data.data?.list || []
    authTotal.value = res.data.data?.total || 0
  } finally {
    authLoading.value = false
  }
}

const openAuthDialog = () => {
  Object.assign(authForm, { reseller_code: '', sku_code: '', region: '', channel_type: 'DIST', begin_date: '', end_date: '', price_grade: 'B', quota_cases: 0 })
  authDialogVisible.value = true
}

const saveAuthorization = async () => {
  authSubmitting.value = true
  try {
    await axios.post('/channel-dealer-ops/authorizations', { ...authForm, quota_cases: Number(authForm.quota_cases || 0) })
    authDialogVisible.value = false
    ElMessage.success('授权新增成功')
    await Promise.all([fetchAuthorizations(), fetchDashboard()])
  } finally {
    authSubmitting.value = false
  }
}

const toggleAuthStatus = async (row: any, status: string) => {
  await axios.post(`/channel-dealer-ops/authorizations/${row.id}/status`, { status })
  ElMessage.success('状态已更新')
  await Promise.all([fetchAuthorizations(), fetchDashboard()])
}

const loadOverreach = async () => {
  const res = await axios.get('/channel-dealer-ops/authorizations/overreach-sales')
  overreachRows.value = res.data.data?.list || []
  overreachDialogVisible.value = true
}

const fetchContracts = async () => {
  contractLoading.value = true
  try {
    const res = await axios.get('/channel-dealer-ops/contracts/list', { params: { ...contractQuery, page: contractPage.value, pageSize: contractPageSize.value } })
    contractRows.value = res.data.data?.list || []
    contractTotal.value = res.data.data?.total || 0
  } finally {
    contractLoading.value = false
  }
}

const openContractDialog = (row?: any) => {
  editingContractId.value = Number(row?.id || 0)
  Object.assign(contractForm, row ? {
    reseller_code: row.reseller_code,
    contract_no: row.contract_no,
    contract_type: row.contract_type,
    start_date: row.start_date,
    end_date: row.end_date,
    cooperation_status: row.cooperation_status,
    renew_status: row.renew_status,
    reminder_days: row.reminder_days
  } : { reseller_code: '', contract_no: '', contract_type: '年度框架', start_date: '', end_date: '', cooperation_status: 'COOPERATING', renew_status: 'NONE', reminder_days: 30 })
  contractDialogVisible.value = true
}

const saveContract = async () => {
  contractSubmitting.value = true
  try {
    if (editingContractId.value) {
      await axios.put(`/channel-dealer-ops/contracts/${editingContractId.value}`, { ...contractForm, reminder_days: Number(contractForm.reminder_days || 30) })
    } else {
      await axios.post('/channel-dealer-ops/contracts', { ...contractForm, reminder_days: Number(contractForm.reminder_days || 30) })
    }
    contractDialogVisible.value = false
    ElMessage.success('合同保存成功')
    await Promise.all([fetchContracts(), fetchDashboard()])
  } finally {
    contractSubmitting.value = false
  }
}

const openContractHistory = async (row: any) => {
  contractHistoryTitle.value = `${row.reseller_name} 历史合同`
  contractHistoryLoading.value = true
  contractHistoryDialogVisible.value = true
  try {
    const res = await axios.get(`/channel-dealer-ops/contracts/history/${row.reseller_code}`)
    contractHistoryRows.value = res.data.data || []
  } finally {
    contractHistoryLoading.value = false
  }
}

const fetchPrices = async () => {
  priceLoading.value = true
  try {
    const res = await axios.get('/channel-dealer-ops/prices/list', { params: { ...priceQuery, page: pricePage.value, pageSize: pricePageSize.value } })
    priceRows.value = res.data.data?.list || []
    priceTotal.value = res.data.data?.total || 0
  } finally {
    priceLoading.value = false
  }
}

const openPriceDialog = () => {
  Object.assign(priceForm, { reseller_code: '', sku_code: '', channel_code: '', price_grade: 'B', price_value: 0, effective_begin: '', effective_end: '' })
  priceDialogVisible.value = true
}

const savePrice = async () => {
  priceSubmitting.value = true
  try {
    await axios.post('/channel-dealer-ops/prices', { ...priceForm, price_value: Number(priceForm.price_value || 0) })
    priceDialogVisible.value = false
    ElMessage.success('价格策略已新增')
    await Promise.all([fetchPrices(), fetchDashboard()])
  } finally {
    priceSubmitting.value = false
  }
}

const submitPrice = async (row: any) => {
  await axios.post(`/channel-dealer-ops/prices/${row.id}/submit`)
  ElMessage.success('已提交审批')
  await Promise.all([fetchPrices(), fetchDashboard()])
}

const reviewPrice = async (row: any, action: 'APPROVE' | 'REJECT') => {
  const { value } = await ElMessageBox.prompt(`请输入${action === 'APPROVE' ? '通过' : '驳回'}意见`, '审批确认', { confirmButtonText: '确定', cancelButtonText: '取消' })
  await axios.post(`/channel-dealer-ops/prices/${row.id}/review`, { action, comment: value })
  ElMessage.success('审批完成')
  await Promise.all([fetchPrices(), fetchDashboard()])
}

const fetchAnalysis = async () => {
  analysisLoading.value = true
  try {
    const res = await axios.get('/channel-dealer-ops/analysis/overview', { params: { dateFrom: analysisDateRange.value?.[0] || '', dateTo: analysisDateRange.value?.[1] || '' } })
    Object.assign(analysis, res.data.data || {})
  } finally {
    analysisLoading.value = false
  }
}

const fetchRisks = async () => {
  riskLoading.value = true
  try {
    const res = await axios.get('/channel-dealer-ops/risks/list', { params: { ...riskQuery, page: riskPage.value, pageSize: riskPageSize.value } })
    riskRows.value = res.data.data?.list || []
    riskTotal.value = res.data.data?.total || 0
  } finally {
    riskLoading.value = false
  }
}

const scanRisks = async () => {
  await axios.post('/channel-dealer-ops/risks/scan')
  ElMessage.success('风险扫描完成')
  await Promise.all([fetchRisks(), fetchDashboard()])
}

const followRisk = async (row: any, status: string) => {
  const { value } = await ElMessageBox.prompt('请输入跟进说明', '风险跟进', { confirmButtonText: '确定', cancelButtonText: '取消' })
  await axios.post(`/channel-dealer-ops/risks/${row.id}/follow-up`, { status, comment: value, action: 'MANUAL_FOLLOW' })
  ElMessage.success('风险已跟进')
  await Promise.all([fetchRisks(), fetchDashboard()])
}

const openRiskDetail = async (row: any) => {
  riskDetailDialogVisible.value = true
  riskDetailLoading.value = true
  try {
    const res = await axios.get(`/channel-dealer-ops/risks/${row.id}`)
    riskDetail.detail = res.data.data?.detail || null
    riskDetail.followups = res.data.data?.followups || []
  } finally {
    riskDetailLoading.value = false
  }
}

const resizeCharts = () => {
  trendChart?.resize()
  riskChart?.resize()
}

onMounted(async () => {
  await fetchOptions()
  await Promise.all([fetchDashboard(), fetchProfiles(), fetchAuthorizations(), fetchContracts(), fetchPrices(), fetchAnalysis(), fetchRisks()])
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  trendChart?.dispose()
  riskChart?.dispose()
})
</script>

<template>
  <div>
    <div class="cards">
      <div v-for="card in summaryCards" :key="card.label" class="card">
        <div class="card-label">{{ card.label }}</div>
        <div class="card-value">{{ formatNumber(card.value) }}</div>
        <div class="card-meta">{{ card.meta }}</div>
      </div>
    </div>

    <div class="charts">
      <div class="panel">
        <h3>渠道经营趋势</h3>
        <div ref="trendChartRef" class="chart"></div>
      </div>
      <div class="panel">
        <h3>经营风险分布</h3>
        <div ref="riskChartRef" class="chart"></div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="ops-tabs">
      <el-tab-pane label="经销商档案中心" name="profiles">
        <div class="toolbar">
          <el-input v-model="profileQuery.keyword" placeholder="经销商/联系人/负责人" clearable style="width: 260px" />
          <el-select v-model="profileQuery.region" clearable placeholder="区域" style="width: 140px">
            <el-option v-for="r in options.regions" :key="r" :label="r" :value="r" />
          </el-select>
          <el-button type="primary" @click="profilePage = 1; fetchProfiles()">查询</el-button>
        </div>
        <el-table :data="profileRows" v-loading="profileLoading" border stripe>
          <el-table-column prop="reseller_code" label="编码" width="150" />
          <el-table-column prop="reseller_name" label="经销商" min-width="170" />
          <el-table-column prop="sale_region_name" label="区域" width="100" />
          <el-table-column prop="lv2_channel_name" label="渠道" width="120" />
          <el-table-column prop="sales_scope" label="销售范围" min-width="150" />
          <el-table-column prop="contact_name" label="联系人" width="120" />
          <el-table-column prop="contact_mobile" label="电话" width="130" />
          <el-table-column prop="owner_name" label="负责人" width="110" />
          <el-table-column prop="credit_level" label="信用等级" width="90" />
          <el-table-column prop="default_warehouse_name" label="默认发货仓" min-width="150" />
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openProfileDialog(row)">维护</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="profilePage"
            v-model:page-size="profilePageSize"
            layout="total, prev, pager, next"
            :total="profileTotal"
            @current-change="fetchProfiles"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="授权管理升级" name="auth">
        <div class="toolbar"><el-input v-model="authQuery.keyword" placeholder="经销商/SKU" clearable style="width:220px" /><el-select v-model="authQuery.region" clearable placeholder="区域" style="width:120px"><el-option v-for="r in options.regions" :key="`a-${r}`" :label="r" :value="r" /></el-select><el-select v-model="authQuery.channelType" clearable placeholder="渠道类型" style="width:120px"><el-option v-for="s in options.enums.channel_type || []" :key="`a-c-${s}`" :label="s" :value="s" /></el-select><el-select v-model="authQuery.status" clearable placeholder="状态" style="width:120px"><el-option label="ACTIVE" value="ACTIVE" /><el-option label="INACTIVE" value="INACTIVE" /><el-option label="EXPIRED" value="EXPIRED" /></el-select><el-button type="primary" @click="authPage = 1; fetchAuthorizations()">查询</el-button><el-button @click="openAuthDialog">新增授权</el-button><el-button type="warning" @click="loadOverreach">超范围销售检测</el-button></div>
        <el-table :data="authRows" v-loading="authLoading" border stripe><el-table-column prop="reseller_name" label="经销商" min-width="160" /><el-table-column prop="sku_name" label="SKU" min-width="180" /><el-table-column prop="region" label="授权区域" width="100" /><el-table-column prop="channel_type" label="授权渠道" width="100" /><el-table-column prop="begin_date" label="生效开始" width="110" /><el-table-column prop="end_date" label="生效结束" width="110" /><el-table-column prop="status" label="状态" width="110" /><el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="success" @click="toggleAuthStatus(row, 'ACTIVE')">启用</el-button><el-button link type="warning" @click="toggleAuthStatus(row, 'INACTIVE')">停用</el-button></template></el-table-column></el-table>
        <div class="pager"><el-pagination v-model:current-page="authPage" v-model:page-size="authPageSize" layout="total, prev, pager, next" :total="authTotal" @current-change="fetchAuthorizations" /></div>
      </el-tab-pane>

      <el-tab-pane label="合同周期管理" name="contracts">
        <div class="toolbar"><el-input v-model="contractQuery.keyword" placeholder="合同号/经销商" clearable style="width:240px" /><el-select v-model="contractQuery.nearExpiry" clearable placeholder="到期提醒" style="width:120px"><el-option label="30天内" value="1" /></el-select><el-button type="primary" @click="contractPage = 1; fetchContracts()">查询</el-button><el-button @click="openContractDialog()">新增合同</el-button></div>
        <el-table :data="contractRows" v-loading="contractLoading" border stripe><el-table-column prop="contract_no" label="合同编号" width="160" /><el-table-column prop="reseller_name" label="经销商" min-width="170" /><el-table-column prop="contract_type" label="合同类型" width="120" /><el-table-column prop="start_date" label="开始日期" width="110" /><el-table-column prop="end_date" label="结束日期" width="110" /><el-table-column prop="days_to_expire" label="距到期(天)" width="110" /><el-table-column prop="renew_status" label="续签状态" width="110" /><el-table-column label="操作" width="160"><template #default="{ row }"><el-button link type="primary" @click="openContractDialog(row)">编辑</el-button><el-button link type="success" @click="openContractHistory(row)">历史</el-button></template></el-table-column></el-table>
        <div class="pager"><el-pagination v-model:current-page="contractPage" v-model:page-size="contractPageSize" layout="total, prev, pager, next" :total="contractTotal" @current-change="fetchContracts" /></div>
      </el-tab-pane>

      <el-tab-pane label="价格政策管理" name="prices">
        <div class="toolbar"><el-input v-model="priceQuery.keyword" placeholder="经销商/SKU/渠道" clearable style="width:240px" /><el-select v-model="priceQuery.priceGrade" clearable placeholder="价格等级" style="width:120px"><el-option v-for="s in ['A', 'B', 'C', 'D']" :key="`p-g-${s}`" :label="s" :value="s" /></el-select><el-select v-model="priceQuery.approveStatus" clearable placeholder="审批状态" style="width:130px"><el-option v-for="s in options.enums.price_approve_status || []" :key="`p-${s}`" :label="s" :value="s" /></el-select><el-button type="primary" @click="pricePage = 1; fetchPrices()">查询</el-button><el-button @click="openPriceDialog">新增价格</el-button></div>
        <el-table :data="priceRows" v-loading="priceLoading" border stripe><el-table-column prop="reseller_name" label="经销商" min-width="160" /><el-table-column prop="channel_name" label="渠道" width="120" /><el-table-column prop="sku_name" label="SKU" min-width="170" /><el-table-column prop="price_grade" label="等级" width="80" /><el-table-column prop="price_value" label="价格" width="100" align="right" /><el-table-column prop="effective_begin" label="生效开始" width="110" /><el-table-column prop="effective_end" label="生效结束" width="110" /><el-table-column prop="approve_status" label="审批状态" width="110" /><el-table-column label="操作" width="210"><template #default="{ row }"><el-button v-if="row.approve_status === 'DRAFT' || row.approve_status === 'REJECTED'" link type="warning" @click="submitPrice(row)">提交审批</el-button><el-button v-if="row.approve_status === 'PENDING'" link type="success" @click="reviewPrice(row, 'APPROVE')">通过</el-button><el-button v-if="row.approve_status === 'PENDING'" link type="danger" @click="reviewPrice(row, 'REJECT')">驳回</el-button></template></el-table-column></el-table>
        <div class="pager"><el-pagination v-model:current-page="pricePage" v-model:page-size="pricePageSize" layout="total, prev, pager, next" :total="priceTotal" @current-change="fetchPrices" /></div>
      </el-tab-pane>

      <el-tab-pane label="渠道销量分析" name="analysis">
        <div class="toolbar"><el-date-picker v-model="analysisDateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" /><el-button type="primary" @click="fetchAnalysis">分析</el-button></div>
        <el-descriptions :column="4" border v-loading="analysisLoading" style="margin-bottom: 10px"><el-descriptions-item label="周期销量(箱)">{{ formatNumber(analysis.summary.total_qty || 0) }}</el-descriptions-item><el-descriptions-item label="上周期销量">{{ formatNumber(analysis.summary.previous_total_qty || 0) }}</el-descriptions-item><el-descriptions-item label="环比增幅">{{ analysis.summary.growth_rate || 0 }}%</el-descriptions-item><el-descriptions-item label="活跃经销商">{{ analysis.summary.reseller_count || 0 }}</el-descriptions-item></el-descriptions>
        <div class="analysis-grid"><el-card><template #header>区域销量</template><el-table :data="analysis.region_sales || []" size="small"><el-table-column prop="region" label="区域" /><el-table-column prop="qty" label="销量" align="right" /><el-table-column prop="growth_rate" label="环比%" align="right" /></el-table></el-card><el-card><template #header>经销商销量排行</template><el-table :data="analysis.dealer_ranking || []" size="small"><el-table-column prop="reseller_name" label="经销商" min-width="150" /><el-table-column prop="qty" label="销量" align="right" /></el-table></el-card><el-card><template #header>渠道结构</template><el-table :data="analysis.channel_structure || []" size="small"><el-table-column prop="channel_name" label="渠道" /><el-table-column prop="qty" label="销量" align="right" /></el-table></el-card><el-card><template #header>SKU结构</template><el-table :data="analysis.sku_structure || []" size="small"><el-table-column prop="sku_name" label="SKU" min-width="150" /><el-table-column prop="qty" label="销量" align="right" /></el-table></el-card></div>
      </el-tab-pane>

      <el-tab-pane label="经营风险识别" name="risks">
        <div class="toolbar"><el-input v-model="riskQuery.keyword" placeholder="经销商/风险描述" clearable style="width:240px" /><el-select v-model="riskQuery.riskType" clearable placeholder="风险类型" style="width:140px"><el-option v-for="s in options.enums.risk_types || []" :key="`r1-${s}`" :label="s" :value="s" /></el-select><el-select v-model="riskQuery.riskLevel" clearable placeholder="风险等级" style="width:120px"><el-option v-for="s in options.enums.risk_level || []" :key="`r3-${s}`" :label="s" :value="s" /></el-select><el-select v-model="riskQuery.status" clearable placeholder="状态" style="width:120px"><el-option v-for="s in options.enums.risk_status || []" :key="`r2-${s}`" :label="s" :value="s" /></el-select><el-button type="primary" @click="riskPage = 1; fetchRisks()">查询</el-button><el-button type="warning" @click="scanRisks">重新扫描</el-button></div>
        <el-table :data="riskRows" v-loading="riskLoading" border stripe><el-table-column prop="reseller_name" label="经销商" min-width="160" /><el-table-column prop="risk_type" label="风险类型" width="140" /><el-table-column prop="risk_level" label="风险等级" width="110" /><el-table-column prop="status" label="状态" width="100" /><el-table-column prop="title" label="标题" min-width="150" /><el-table-column prop="description" label="说明" min-width="260" show-overflow-tooltip /><el-table-column label="操作" width="260"><template #default="{ row }"><el-button link type="info" @click="openRiskDetail(row)">详情</el-button><el-button link type="primary" @click="followRisk(row, 'PROCESSING')">标记处理中</el-button><el-button link type="success" @click="followRisk(row, 'CLOSED')">关闭风险</el-button></template></el-table-column></el-table>
        <div class="pager"><el-pagination v-model:current-page="riskPage" v-model:page-size="riskPageSize" layout="total, prev, pager, next" :total="riskTotal" @current-change="fetchRisks" /></div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="profileDialogVisible" title="维护经销商档案" width="860px">
      <div class="toolbar">
        <el-input v-model="profileForm.reseller_code" placeholder="经销商编码" disabled style="width: 180px" />
        <el-input v-model="profileForm.reseller_name" placeholder="经销商名称" disabled style="width: 260px" />
        <el-select v-model="profileForm.status" style="width: 120px">
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
      </div>
      <div class="toolbar">
        <el-select v-model="profileForm.sale_region_name" clearable filterable placeholder="区域" style="width: 160px">
          <el-option v-for="r in options.regions" :key="`pf-r-${r}`" :label="r" :value="r" />
        </el-select>
        <el-select v-model="profileForm.lv2_channel_code" clearable filterable placeholder="渠道" style="width: 220px">
          <el-option v-for="c in options.channels" :key="`pf-c-${c.channel_code}`" :label="c.channel_name" :value="c.channel_code" />
        </el-select>
        <el-input v-model="profileForm.sales_scope" placeholder="销售范围" style="width: 260px" />
      </div>
      <div class="toolbar">
        <el-input v-model="profileForm.contact_name" placeholder="联系人" style="width: 150px" />
        <el-input v-model="profileForm.contact_mobile" placeholder="联系电话" style="width: 180px" />
        <el-input v-model="profileForm.owner_name" placeholder="负责人" style="width: 150px" />
        <el-select v-model="profileForm.credit_level" placeholder="信用等级" style="width: 120px">
          <el-option v-for="s in ['A', 'B', 'C', 'D']" :key="`pf-g-${s}`" :label="s" :value="s" />
        </el-select>
      </div>
      <div class="toolbar">
        <el-select v-model="profileForm.default_warehouse_code" clearable filterable placeholder="默认发货仓" style="width: 240px">
          <el-option v-for="w in options.warehouses" :key="`pf-w-${w.warehouse_code}`" :label="w.warehouse_name" :value="w.warehouse_code" />
        </el-select>
        <el-input v-model="profileForm.settlement_type" placeholder="结算属性" style="width: 220px" />
        <el-input-number v-model="profileForm.payment_term_days" :min="0" :max="365" style="width: 150px" />
      </div>
      <template #footer>
        <el-button @click="profileDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="profileSubmitting" @click="saveProfile">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="authDialogVisible" title="新增授权" width="760px">
      <div class="toolbar"><el-select v-model="authForm.reseller_code" filterable placeholder="经销商" style="width:260px"><el-option v-for="r in options.resellers" :key="r.reseller_code" :label="`${r.reseller_name} (${r.reseller_code})`" :value="r.reseller_code" /></el-select><el-select v-model="authForm.sku_code" filterable placeholder="SKU" style="width:260px"><el-option v-for="s in options.skus" :key="s.sku_code" :label="`${s.sku_name} (${s.sku_code})`" :value="s.sku_code" /></el-select><el-input-number v-model="authForm.quota_cases" :min="0" style="width:160px" /></div>
      <div class="toolbar"><el-input v-model="authForm.region" placeholder="授权区域" style="width:170px" /><el-select v-model="authForm.channel_type" style="width:140px"><el-option label="DIST" value="DIST" /><el-option label="KA" value="KA" /><el-option label="ECOM" value="ECOM" /><el-option label="TRAD" value="TRAD" /></el-select><el-date-picker v-model="authForm.begin_date" type="date" placeholder="开始日期" value-format="YYYY-MM-DD" style="width:160px" /><el-date-picker v-model="authForm.end_date" type="date" placeholder="结束日期" value-format="YYYY-MM-DD" style="width:160px" /><el-input v-model="authForm.price_grade" placeholder="价格等级" style="width:110px" /></div>
      <template #footer><el-button @click="authDialogVisible = false">取消</el-button><el-button type="primary" :loading="authSubmitting" @click="saveAuthorization">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="overreachDialogVisible" title="超范围销售检测结果" width="900px"><el-table :data="overreachRows" border><el-table-column prop="order_no" label="订单号" width="150" /><el-table-column prop="reseller_name" label="经销商" min-width="150" /><el-table-column prop="sku_name" label="SKU" min-width="160" /><el-table-column prop="qty" label="数量" width="90" align="right" /><el-table-column prop="reason" label="风险原因" min-width="180" /><el-table-column prop="order_date" label="日期" width="110" /></el-table></el-dialog>

    <el-dialog v-model="contractDialogVisible" :title="editingContractId ? '编辑合同' : '新增合同'" width="760px">
      <div class="toolbar"><el-select v-model="contractForm.reseller_code" filterable placeholder="经销商" style="width:260px"><el-option v-for="r in options.resellers" :key="`c-${r.reseller_code}`" :label="`${r.reseller_name} (${r.reseller_code})`" :value="r.reseller_code" /></el-select><el-input v-model="contractForm.contract_no" placeholder="合同编号(可空自动生成)" style="width:260px" /><el-input v-model="contractForm.contract_type" placeholder="合同类型" style="width:180px" /></div>
      <div class="toolbar"><el-date-picker v-model="contractForm.start_date" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:170px" /><el-date-picker v-model="contractForm.end_date" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:170px" /><el-select v-model="contractForm.cooperation_status" style="width:150px"><el-option label="COOPERATING" value="COOPERATING" /><el-option label="PAUSED" value="PAUSED" /><el-option label="ENDED" value="ENDED" /></el-select><el-select v-model="contractForm.renew_status" style="width:130px"><el-option label="NONE" value="NONE" /><el-option label="PENDING" value="PENDING" /><el-option label="RENEWED" value="RENEWED" /></el-select><el-input-number v-model="contractForm.reminder_days" :min="1" style="width:120px" /></div>
      <template #footer><el-button @click="contractDialogVisible = false">取消</el-button><el-button type="primary" :loading="contractSubmitting" @click="saveContract">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="contractHistoryDialogVisible" :title="contractHistoryTitle || '历史合同'" width="980px">
      <el-table :data="contractHistoryRows" v-loading="contractHistoryLoading" border stripe>
        <el-table-column prop="contract_no" label="合同编号" width="160" />
        <el-table-column prop="contract_type" label="合同类型" width="120" />
        <el-table-column prop="start_date" label="开始日期" width="110" />
        <el-table-column prop="end_date" label="结束日期" width="110" />
        <el-table-column prop="cooperation_status" label="合作状态" width="120" />
        <el-table-column prop="renew_status" label="续签状态" width="120" />
        <el-table-column prop="renew_contract_no" label="续签合同号" min-width="160" />
        <el-table-column prop="updated_at" label="更新时间" min-width="170" />
      </el-table>
    </el-dialog>

    <el-dialog v-model="priceDialogVisible" title="新增价格策略" width="760px">
      <div class="toolbar"><el-select v-model="priceForm.reseller_code" filterable placeholder="经销商" style="width:240px"><el-option v-for="r in options.resellers" :key="`p-r-${r.reseller_code}`" :label="`${r.reseller_name} (${r.reseller_code})`" :value="r.reseller_code" /></el-select><el-select v-model="priceForm.sku_code" filterable placeholder="SKU" style="width:240px"><el-option v-for="s in options.skus" :key="`p-s-${s.sku_code}`" :label="`${s.sku_name} (${s.sku_code})`" :value="s.sku_code" /></el-select><el-input-number v-model="priceForm.price_value" :min="0.01" :step="0.1" style="width:160px" /></div>
      <div class="toolbar"><el-select v-model="priceForm.channel_code" filterable placeholder="渠道" style="width:200px"><el-option v-for="c in options.channels" :key="`p-c-${c.channel_code}`" :label="c.channel_name" :value="c.channel_code" /></el-select><el-input v-model="priceForm.price_grade" placeholder="等级" style="width:110px" /><el-date-picker v-model="priceForm.effective_begin" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:170px" /><el-date-picker v-model="priceForm.effective_end" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:170px" /></div>
      <template #footer><el-button @click="priceDialogVisible = false">取消</el-button><el-button type="primary" :loading="priceSubmitting" @click="savePrice">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="riskDetailDialogVisible" title="风险详情与跟进记录" width="980px">
      <el-skeleton v-if="riskDetailLoading" :rows="6" animated />
      <template v-else>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="经销商">{{ riskDetail.detail?.reseller_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="风险类型">{{ riskDetail.detail?.risk_type || '-' }}</el-descriptions-item>
          <el-descriptions-item label="风险等级">{{ riskDetail.detail?.risk_level || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ riskDetail.detail?.status || '-' }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ riskDetail.detail?.title || '-' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ riskDetail.detail?.owner || '-' }}</el-descriptions-item>
          <el-descriptions-item label="说明" :span="2">{{ riskDetail.detail?.description || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider>跟进记录</el-divider>
        <el-table :data="riskDetail.followups || []" border stripe>
          <el-table-column prop="created_at" label="时间" width="170" />
          <el-table-column prop="operator" label="操作人" width="130" />
          <el-table-column prop="action" label="动作" width="140" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column prop="comment" label="跟进说明" min-width="320" show-overflow-tooltip />
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.card {
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
}

.card-label {
  color: #64748b;
  font-size: 12px;
}

.card-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.card-meta {
  margin-top: 8px;
  font-size: 12px;
  color: #475569;
}

.charts {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.panel {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 14px;
}

.panel h3 {
  margin: 0 0 10px;
  font-size: 15px;
  color: #0f172a;
}

.chart {
  width: 100%;
  height: 280px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1400px) {
  .cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .charts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analysis-grid {
    grid-template-columns: 1fr;
  }
}
</style>
