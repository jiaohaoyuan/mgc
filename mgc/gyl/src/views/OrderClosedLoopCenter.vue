<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

interface OrderLineForm {
  sku_code: string
  order_qty: number
  unit: string
  unit_price: number
  suggested_warehouse_code: string
}

const activeTab = ref('dashboard')
const route = useRoute()

const config = reactive<any>({
  enums: {
    orderSourceTypes: [],
    orderStatuses: [],
    fulfillmentStatuses: [],
    exceptionTypes: []
  },
  customers: [],
  skus: [],
  warehouses: []
})

const dashboardFilters = reactive({
  region: '',
  channel: '',
  skuCode: ''
})

const dashboard = reactive<any>({
  total_orders: 0,
  total_lines: 0,
  allocation_success_rate: 0,
  exception_rate: 0,
  fulfillment_rate: 0,
  stockout_rate: 0,
  by_region: {},
  by_channel: {},
  by_status: {}
})

const allocationWeights = reactive<any>({
  inventory_weight: 0.32,
  distance_weight: 0.22,
  freshness_weight: 0.2,
  cost_weight: 0.14,
  priority_weight: 0.12
})

const listQuery = reactive({
  keyword: '',
  status: '',
  reviewStatus: '',
  source: '',
  hasException: ''
})

const orderRows = ref<any[]>([])
const orderTotal = ref(0)
const orderPage = ref(1)
const orderPageSize = ref(10)
const orderLoading = ref(false)

const orderDialogVisible = ref(false)
const orderDialogLoading = ref(false)
const editingOrderNo = ref('')
const orderForm = reactive<any>({
  customer_code: '',
  order_source: 'MANUAL',
  lines: [] as OrderLineForm[]
})

const detailLoading = ref(false)
const detailDrawerVisible = ref(false)
const currentDetail = ref<any>(null)
const lastRoutedOrderNo = ref('')

const exceptionRows = ref<any[]>([])
const exceptionLoading = ref(false)

const addFormLine = () => {
  orderForm.lines.push({
    sku_code: '',
    order_qty: 0,
    unit: '箱',
    unit_price: 0,
    suggested_warehouse_code: ''
  })
}

const removeFormLine = (index: number) => {
  orderForm.lines.splice(index, 1)
}

const customerOptions = computed(() => config.customers || [])
const skuOptions = computed(() => (config.skus || []).filter((item: any) => String(item.lifecycle_status).toUpperCase() === 'ACTIVE'))
const warehouseOptions = computed(() => config.warehouses || [])

const applyCustomerPreset = () => {
  const customer = customerOptions.value.find((item: any) => item.customer_code === orderForm.customer_code)
  if (!customer) return
  orderForm.lines.forEach((line: any) => {
    if (!line.suggested_warehouse_code) line.suggested_warehouse_code = customer.default_warehouse_code
  })
}

const fillLineSkuNameAndPrice = (line: any) => {
  const sku = skuOptions.value.find((item: any) => item.sku_code === line.sku_code)
  if (!sku) return
  if (!line.unit_price) {
    line.unit_price = sku.sku_code.includes('PASTEUR') ? 48 : 36
  }
}

const fetchConfig = async () => {
  const res = await axios.get('/orders/phase2/config')
  Object.assign(config, res.data.data || {})
}

const fetchDashboard = async () => {
  const res = await axios.get('/orders/phase2/dashboard', { params: { ...dashboardFilters } })
  Object.assign(dashboard, res.data.data || {})
}

const fetchWeights = async () => {
  const res = await axios.get('/orders/phase2/allocation/weights')
  Object.assign(allocationWeights, res.data.data || {})
}

const saveWeights = async () => {
  await axios.put('/orders/phase2/allocation/weights', { ...allocationWeights })
  ElMessage.success('分配权重已保存')
}

const fetchOrders = async () => {
  orderLoading.value = true
  try {
    const res = await axios.get('/orders/phase2/list', {
      params: {
        ...listQuery,
        page: orderPage.value,
        pageSize: orderPageSize.value
      }
    })
    orderRows.value = res.data.data.list || []
    orderTotal.value = res.data.data.total || 0
  } finally {
    orderLoading.value = false
  }
}

const fetchExceptions = async () => {
  exceptionLoading.value = true
  try {
    const res = await axios.get('/orders/phase2/exceptions/list', {
      params: { page: 1, pageSize: 200, status: 'OPEN' }
    })
    exceptionRows.value = res.data.data.list || []
  } finally {
    exceptionLoading.value = false
  }
}

const openCreateDialog = () => {
  editingOrderNo.value = ''
  orderForm.customer_code = ''
  orderForm.order_source = 'MANUAL'
  orderForm.lines = []
  addFormLine()
  orderDialogVisible.value = true
}

const openEditDialog = async (orderNo: string) => {
  const res = await axios.get(`/orders/phase2/${orderNo}`)
  const detail = res.data.data
  editingOrderNo.value = orderNo
  orderForm.customer_code = detail.header.customer_code
  orderForm.order_source = detail.header.order_source
  orderForm.lines = (detail.lines || []).map((line: any) => ({
    sku_code: line.sku_code,
    order_qty: Number(line.order_qty || 0),
    unit: line.unit || '箱',
    unit_price: Number(line.unit_price || 0),
    suggested_warehouse_code: line.suggested_warehouse_code || ''
  }))
  if (!orderForm.lines.length) addFormLine()
  orderDialogVisible.value = true
}

const saveOrder = async () => {
  if (!orderForm.customer_code) {
    ElMessage.warning('请选择客户')
    return
  }
  if (!orderForm.lines.length) {
    ElMessage.warning('请至少填写一行订单')
    return
  }
  orderDialogLoading.value = true
  try {
    const payload = {
      customer_code: orderForm.customer_code,
      order_source: orderForm.order_source,
      lines: orderForm.lines.map((line: any) => ({
        ...line,
        order_qty: Number(line.order_qty || 0),
        unit_price: Number(line.unit_price || 0)
      }))
    }

    if (editingOrderNo.value) {
      await axios.put(`/orders/phase2/${editingOrderNo.value}`, payload)
      ElMessage.success('订单已更新')
    } else {
      await axios.post('/orders/phase2', payload)
      ElMessage.success('订单已创建')
    }

    orderDialogVisible.value = false
    await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
  } finally {
    orderDialogLoading.value = false
  }
}

const submitOrder = async (orderNo: string) => {
  await axios.post(`/orders/phase2/${orderNo}/submit`)
  ElMessage.success('已提交审核')
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
}

const auditOrder = async (orderNo: string, action: 'APPROVE' | 'REJECT') => {
  const promptLabel = action === 'APPROVE' ? '审核通过意见' : '驳回原因'
  const ret = await ElMessageBox.prompt(`请输入${promptLabel}`, action === 'APPROVE' ? '审核通过' : '驳回订单', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputPlaceholder: '可选'
  })
  await axios.post(`/orders/phase2/${orderNo}/audit`, { action, comment: ret.value || '' })
  ElMessage.success(action === 'APPROVE' ? '审核通过' : '审核驳回')
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
}

const copyOrder = async (orderNo: string) => {
  await axios.post(`/orders/phase2/${orderNo}/copy`)
  ElMessage.success('订单已复制为草稿')
  await fetchOrders()
}

const openDetail = async (orderNo: string) => {
  detailLoading.value = true
  detailDrawerVisible.value = true
  try {
    const res = await axios.get(`/orders/phase2/${orderNo}`)
    currentDetail.value = res.data.data
  } finally {
    detailLoading.value = false
  }
}

const autoAllocate = async (orderNo: string) => {
  await axios.post(`/orders/phase2/${orderNo}/allocate/auto`)
  ElMessage.success('已完成智能分配')
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
  await openDetail(orderNo)
}

const manualAllocateLine = async (orderNo: string, line: any) => {
  const ret = await ElMessageBox.prompt('请输入人工分配数量', `人工分配 - 行${line.line_no}`, {
    inputValue: String(line.order_qty || 0),
    confirmButtonText: '保存',
    cancelButtonText: '取消'
  })
  const qty = Number(ret.value || 0)
  if (qty <= 0) {
    ElMessage.warning('分配数量必须大于0')
    return
  }
  await axios.post(`/orders/phase2/${orderNo}/allocate/manual`, {
    line_id: line.id,
    comment: '人工覆盖分配',
    allocations: [{ warehouse_code: line.suggested_warehouse_code, warehouse_name: line.suggested_warehouse_name, qty }]
  })
  ElMessage.success('人工分配已保存')
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
  await openDetail(orderNo)
}

const generateSuggestion = async (orderNo: string) => {
  await axios.post(`/orders/phase2/${orderNo}/replenishment/generate`)
  ElMessage.success('补货/调拨建议已生成')
  await openDetail(orderNo)
}

const decideSuggestion = async (suggestionId: number, action: 'EXECUTED' | 'REJECTED') => {
  await axios.post(`/orders/phase2/replenishment/${suggestionId}/decision`, { action })
  ElMessage.success(action === 'EXECUTED' ? '建议已执行' : '建议已驳回')
  if (currentDetail.value?.header?.order_no) {
    await openDetail(currentDetail.value.header.order_no)
  }
}

const updateFulfillment = async (orderNo: string, status: string) => {
  await axios.post(`/orders/phase2/${orderNo}/fulfillment`, { status })
  ElMessage.success('履约状态已更新')
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
  await openDetail(orderNo)
}

const handleFulfillmentSelect = (status: string) => {
  const orderNo = currentDetail.value?.header?.order_no
  if (!orderNo) return
  void updateFulfillment(orderNo, status)
}

const claimException = async (id: number) => {
  await axios.post(`/orders/phase2/exceptions/${id}/claim`)
  ElMessage.success('异常已认领')
  await fetchExceptions()
}

const closeException = async (id: number) => {
  const ret = await ElMessageBox.prompt('请输入处理意见', '关闭异常', {
    confirmButtonText: '关闭',
    cancelButtonText: '取消'
  })
  await axios.post(`/orders/phase2/exceptions/${id}/handle`, { comment: ret.value || '已处理' })
  ElMessage.success('异常已关闭')
  await fetchExceptions()
}

const importDemo = async () => {
  const rows = [
    { group_no: 'G-1', customer_code: 'RS-SZ-LH', sku_code: 'SKU-UHT-UHT-250ML-12BX-PLN-001', order_qty: 120, unit: '箱', unit_price: 36 },
    { group_no: 'G-1', customer_code: 'RS-SZ-LH', sku_code: 'SKU-FRM-PAS-950ML-01BT-PLN-001', order_qty: 90, unit: '箱', unit_price: 48 },
    { group_no: 'G-2', customer_code: 'RS-DY-FLAG', sku_code: 'SKU-UHT-UHT-250ML-12BX-PLN-001', order_qty: 200, unit: '箱', unit_price: 35 }
  ]
  await axios.post('/orders/phase2/import', { rows })
  ElMessage.success('示例批量导入完成')
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
}

const openOrderDetailByRoute = async () => {
  const orderNo = String(route.query.orderNo || '').trim()
  if (!orderNo || orderNo === lastRoutedOrderNo.value) return
  lastRoutedOrderNo.value = orderNo
  try {
    activeTab.value = 'orders'
    listQuery.keyword = orderNo
    orderPage.value = 1
    await fetchOrders()
    await openDetail(orderNo)
  } catch {
    ElMessage.warning(`未找到订单 ${orderNo}`)
  }
}

onMounted(async () => {
  await Promise.all([fetchConfig(), fetchWeights()])
  await Promise.all([fetchOrders(), fetchDashboard(), fetchExceptions()])
  await openOrderDetailByRoute()
})

watch(
  () => route.query.orderNo,
  () => {
    void openOrderDetailByRoute()
  }
)
</script>
<template>
  <div>
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon><Finished /></el-icon>
          订单与智能订购闭环中心（第二阶段）
        </div>
        <div class="toolbar-right">
          <el-button @click="importDemo">批量导入示例</el-button>
          <el-button type="primary" @click="openCreateDialog">新建订单</el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="闭环看板" name="dashboard">
          <div class="stat-cards">
            <div class="stat-card"><div class="stat-card-info"><h3>{{ dashboard.total_orders }}</h3><p>订单总数</p></div></div>
            <div class="stat-card"><div class="stat-card-info"><h3>{{ (dashboard.allocation_success_rate * 100).toFixed(1) }}%</h3><p>分配成功率</p></div></div>
            <div class="stat-card"><div class="stat-card-info"><h3>{{ (dashboard.exception_rate * 100).toFixed(1) }}%</h3><p>异常率</p></div></div>
            <div class="stat-card"><div class="stat-card-info"><h3>{{ (dashboard.fulfillment_rate * 100).toFixed(1) }}%</h3><p>履约率</p></div></div>
          </div>

          <el-row :gutter="16">
            <el-col :span="8">
              <div class="metric-card">
                <div class="metric-title">智能分配权重</div>
                <div class="metric-item">库存权重 <el-slider v-model="allocationWeights.inventory_weight" :min="0" :max="1" :step="0.01" /></div>
                <div class="metric-item">距离权重 <el-slider v-model="allocationWeights.distance_weight" :min="0" :max="1" :step="0.01" /></div>
                <div class="metric-item">鲜度权重 <el-slider v-model="allocationWeights.freshness_weight" :min="0" :max="1" :step="0.01" /></div>
                <div class="metric-item">成本权重 <el-slider v-model="allocationWeights.cost_weight" :min="0" :max="1" :step="0.01" /></div>
                <div class="metric-item">优先级权重 <el-slider v-model="allocationWeights.priority_weight" :min="0" :max="1" :step="0.01" /></div>
                <el-button type="primary" @click="saveWeights">保存权重</el-button>
              </div>
            </el-col>
            <el-col :span="16">
              <div class="metric-card">
                <div class="metric-title">维度筛选</div>
                <div class="toolbar">
                  <el-select v-model="dashboardFilters.region" clearable placeholder="区域" style="width: 160px">
                    <el-option v-for="item in config.customers" :key="item.region" :label="item.region" :value="item.region" />
                  </el-select>
                  <el-select v-model="dashboardFilters.channel" clearable placeholder="渠道" style="width: 160px">
                    <el-option v-for="item in config.customers" :key="item.channel_code" :label="item.channel_name" :value="item.channel_code" />
                  </el-select>
                  <el-select v-model="dashboardFilters.skuCode" clearable placeholder="SKU" style="width: 200px">
                    <el-option v-for="item in skuOptions" :key="item.sku_code" :label="item.sku_name" :value="item.sku_code" />
                  </el-select>
                  <el-button type="primary" @click="fetchDashboard">刷新看板</el-button>
                </div>
                <el-divider />
                <div class="status-grid">
                  <el-tag v-for="(val, key) in dashboard.by_status" :key="key" size="large" effect="plain">{{ key }}: {{ val }}</el-tag>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="订单闭环" name="orders">
          <div class="toolbar" style="margin-bottom: 12px">
            <el-input v-model="listQuery.keyword" placeholder="订单号/客户/区域" style="width: 220px" clearable />
            <el-select v-model="listQuery.status" placeholder="订单状态" clearable style="width: 150px">
              <el-option v-for="item in config.enums.orderStatuses" :key="item" :label="item" :value="item" />
            </el-select>
            <el-select v-model="listQuery.source" placeholder="订单来源" clearable style="width: 150px">
              <el-option v-for="item in config.enums.orderSourceTypes" :key="item" :label="item" :value="item" />
            </el-select>
            <el-select v-model="listQuery.hasException" placeholder="异常标记" clearable style="width: 130px">
              <el-option label="有异常" value="1" />
              <el-option label="无异常" value="0" />
            </el-select>
            <el-button type="primary" @click="fetchOrders">查询</el-button>
          </div>

          <el-table :data="orderRows" v-loading="orderLoading" border stripe>
            <el-table-column prop="order_no" label="订单号" min-width="170" />
            <el-table-column prop="customer_name" label="客户" min-width="200" show-overflow-tooltip />
            <el-table-column prop="order_source" label="来源" width="130" />
            <el-table-column prop="order_status" label="状态" width="140" />
            <el-table-column prop="review_status" label="审核" width="120" />
            <el-table-column prop="fulfillment_status" label="履约" width="140" />
            <el-table-column prop="total_qty" label="总量" width="100" align="right" />
            <el-table-column prop="total_amount" label="总金额" width="120" align="right" />
            <el-table-column label="操作" fixed="right" width="420">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row.order_no)">详情</el-button>
                <el-button link type="primary" @click="openEditDialog(row.order_no)" :disabled="!(row.order_status === 'DRAFT' || row.order_status === 'REJECTED')">编辑</el-button>
                <el-button link type="success" @click="submitOrder(row.order_no)" :disabled="!(row.order_status === 'DRAFT' || row.order_status === 'REJECTED')">提交审核</el-button>
                <el-button link type="success" @click="auditOrder(row.order_no, 'APPROVE')" :disabled="row.order_status !== 'PENDING_REVIEW'">通过</el-button>
                <el-button link type="danger" @click="auditOrder(row.order_no, 'REJECT')" :disabled="row.order_status !== 'PENDING_REVIEW'">驳回</el-button>
                <el-button link type="warning" @click="autoAllocate(row.order_no)" :disabled="row.order_status !== 'APPROVED' && row.order_status !== 'CLOSED'">分配</el-button>
                <el-button link @click="copyOrder(row.order_no)">复制</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div style="display:flex; justify-content:flex-end; margin-top:12px">
            <el-pagination v-model:current-page="orderPage" v-model:page-size="orderPageSize" layout="total, prev, pager, next" :total="orderTotal" @current-change="fetchOrders" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="异常处置" name="exceptions">
          <el-table :data="exceptionRows" v-loading="exceptionLoading" border stripe>
            <el-table-column prop="id" label="异常ID" width="90" />
            <el-table-column prop="order_no" label="订单号" min-width="160" />
            <el-table-column prop="customer_name" label="客户" min-width="180" show-overflow-tooltip />
            <el-table-column prop="exception_type" label="异常类型" min-width="160" />
            <el-table-column prop="reason" label="异常原因" min-width="220" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button link type="primary" @click="claimException(row.id)" :disabled="row.status !== 'OPEN'">认领</el-button>
                <el-button link type="success" @click="closeException(row.id)" :disabled="row.status === 'CLOSED'">关闭</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-drawer v-model="detailDrawerVisible" title="订单详情" size="70%" :destroy-on-close="true">
      <div v-loading="detailLoading" v-if="currentDetail?.header">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-tag type="primary">{{ currentDetail.header.order_no }}</el-tag>
          <el-tag>{{ currentDetail.header.order_status }}</el-tag>
          <el-select :model-value="currentDetail.header.fulfillment_status" style="width: 180px" @change="handleFulfillmentSelect">
            <el-option v-for="item in config.enums.fulfillmentStatuses" :key="item" :label="item" :value="item" />
          </el-select>
          <el-button type="warning" @click="generateSuggestion(currentDetail.header.order_no)">生成补货/调拨建议</el-button>
        </div>

        <el-table :data="currentDetail.lines" border>
          <el-table-column prop="line_no" label="行号" width="80" />
          <el-table-column prop="sku_code" label="SKU" width="170" />
          <el-table-column prop="sku_name" label="SKU名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="order_qty" label="订货量" width="100" align="right" />
          <el-table-column prop="allocated_qty" label="已分配" width="100" align="right" />
          <el-table-column prop="suggested_warehouse_name" label="建议发货仓" min-width="160" />
          <el-table-column prop="exception_flag" label="异常" width="90">
            <template #default="{ row }">
              <el-tag :type="row.exception_flag ? 'danger' : 'success'">{{ row.exception_flag ? '有' : '无' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130">
            <template #default="{ row }">
              <el-button link type="primary" @click="manualAllocateLine(currentDetail.header.order_no, row)">人工覆盖</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-divider />
        <h4 style="margin: 8px 0">补货/调拨建议</h4>
        <el-table :data="currentDetail.replenishment_suggestions || []" border>
          <el-table-column prop="id" label="建议ID" width="90" />
          <el-table-column prop="suggestion_type" label="类型" width="120" />
          <el-table-column prop="source_warehouse_name" label="来源仓" min-width="160" />
          <el-table-column prop="target_warehouse_name" label="目标仓" min-width="160" />
          <el-table-column prop="suggest_qty" label="建议数量" width="120" align="right" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button link type="success" @click="decideSuggestion(row.id, 'EXECUTED')" :disabled="row.status !== 'PENDING'">执行</el-button>
              <el-button link type="danger" @click="decideSuggestion(row.id, 'REJECTED')" :disabled="row.status !== 'PENDING'">驳回</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>

    <el-dialog v-model="orderDialogVisible" :title="editingOrderNo ? '编辑订单' : '新建订单'" width="900px" :close-on-click-modal="false">
      <div class="toolbar" style="margin-bottom: 12px">
        <el-select v-model="orderForm.customer_code" placeholder="选择客户" style="width: 260px" @change="applyCustomerPreset">
          <el-option v-for="item in customerOptions" :key="item.customer_code" :label="item.customer_name" :value="item.customer_code" />
        </el-select>
        <el-select v-model="orderForm.order_source" placeholder="订单来源" style="width: 180px">
          <el-option v-for="item in config.enums.orderSourceTypes" :key="item" :label="item" :value="item" />
        </el-select>
        <el-button @click="addFormLine">新增行</el-button>
      </div>

      <el-table :data="orderForm.lines" border>
        <el-table-column label="SKU" min-width="220">
          <template #default="{ row }">
            <el-select v-model="row.sku_code" filterable placeholder="SKU" @change="() => fillLineSkuNameAndPrice(row)">
              <el-option v-for="sku in skuOptions" :key="sku.sku_code" :label="`${sku.sku_code} / ${sku.sku_name}`" :value="sku.sku_code" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="140">
          <template #default="{ row }"><el-input-number v-model="row.order_qty" :min="0" :step="10" style="width: 120px" /></template>
        </el-table-column>
        <el-table-column label="单价" width="140">
          <template #default="{ row }"><el-input-number v-model="row.unit_price" :min="0" :step="1" style="width: 120px" /></template>
        </el-table-column>
        <el-table-column label="建议发货仓" min-width="220">
          <template #default="{ row }">
            <el-select v-model="row.suggested_warehouse_code" filterable placeholder="仓库">
              <el-option v-for="wh in warehouseOptions" :key="wh.warehouse_code" :label="wh.warehouse_name" :value="wh.warehouse_code" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ $index }"><el-button link type="danger" @click="removeFormLine($index)">删除</el-button></template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="orderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="orderDialogLoading" @click="saveOrder">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.metric-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px;
  min-height: 260px;
}

.metric-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
}

.metric-item {
  margin-bottom: 8px;
  font-size: 13px;
}

.status-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
