<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import axios from 'axios'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'

type Pasture = {
  id: number
  name: string
  aqi: number
  totalYield: number
}

type DailyRow = {
  id: number
  bizDate: string
  pastureId: number
  pastureName: string
  outputQty: number
  deviceStatus: 'NORMAL' | 'MAINTENANCE' | 'FAULT'
  envTemp: number
  envHumidity: number
  envAqi: number
  note: string
}

type QualityRow = {
  id: number
  bizDate: string
  batchNo: string
  pastureId: number
  pastureName: string
  fatRate: number
  proteinRate: number
  somaticCell: number
  status: 'PASS' | 'ABNORMAL'
  note: string
}

type ShipmentRow = {
  id: number
  bizDate: string
  pastureId: number
  pastureName: string
  targetWarehouse: string
  plannedQty: number
  executedQty: number
  status: 'PLANNED' | 'PARTIAL' | 'DONE'
}

type TempRow = {
  id: number
  bizDate: string
  pastureId: number
  pastureName: string
  temperature: number
  minTemp: number
  maxTemp: number
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  responsible: string
  status: 'OPEN' | 'PROCESSING' | 'CLOSED'
  description: string
}

type ForecastRow = {
  id: number
  version: string
  granularity: 'DAY' | 'WEEK' | 'MONTH'
  forecastDate: string
  pastureName: string
  predictedQty: number
  actualQty: number
}

const loading = ref(false)
const activeTab = ref('daily')
const pastures = ref<Pasture[]>([])
const warehouses = ref<string[]>([])

const dailyRows = ref<DailyRow[]>([])
const qualityRows = ref<QualityRow[]>([])
const shipmentRows = ref<ShipmentRow[]>([])
const tempRows = ref<TempRow[]>([])
const forecastRows = ref<ForecastRow[]>([])

const outputChartRef = ref<HTMLDivElement>()
const qualityChartRef = ref<HTMLDivElement>()
let outputChart: echarts.ECharts | null = null
let qualityChart: echarts.ECharts | null = null

const dailyQuery = reactive({ keyword: '', pastureId: 0 })
const qualityQuery = reactive({ status: '', pastureId: 0 })
const shipmentQuery = reactive({ status: '', pastureId: 0 })
const tempQuery = reactive({ level: '', status: '' })
const forecastQuery = reactive({ granularity: '', version: '' })

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const round2 = (n: number) => Number(n.toFixed(2))
const formatNum = (n: number) => Number(n || 0).toLocaleString('zh-CN')

const dailyMap = computed(() => {
  const map = new Map<number, Pasture>()
  pastures.value.forEach((p) => map.set(Number(p.id), p))
  return map
})

const bootstrap = () => {
  dailyRows.value = []
  qualityRows.value = []
  shipmentRows.value = []
  tempRows.value = []
  forecastRows.value = []

  pastures.value.forEach((p, idx) => {
    const baseQty = Math.max(12000, Math.round((p.totalYield || 70000) / 3))
    for (let i = 0; i < 24; i += 1) {
      const bizDate = addDays(today(), -i)
      const outputQty = round2(baseQty * (1 + (((i + idx) % 7) - 3) * 0.03))
      const deviceStatus = (i + idx) % 17 === 0 ? 'FAULT' : ((i + idx) % 9 === 0 ? 'MAINTENANCE' : 'NORMAL')
      dailyRows.value.push({
        id: dailyRows.value.length + 1,
        bizDate,
        pastureId: Number(p.id),
        pastureName: p.name,
        outputQty,
        deviceStatus,
        envTemp: round2(17 + ((i + idx) % 10) * 1.1),
        envHumidity: round2(56 + ((i * 3 + idx) % 27)),
        envAqi: Math.max(20, Number(p.aqi || 35) + ((i + idx) % 8) - 4),
        note: deviceStatus === 'FAULT' ? '挤奶设备报警，已安排检修' : ''
      })
    }
  })

  dailyRows.value.slice(0, 120).forEach((row, idx) => {
    const somatic = 170 + ((idx * 19) % 170)
    const abnormal = somatic > 285 || idx % 21 === 0
    qualityRows.value.push({
      id: qualityRows.value.length + 1,
      bizDate: row.bizDate,
      batchNo: `MB-${row.bizDate.replace(/-/g, '')}-${String(row.pastureId).padStart(3, '0')}-${String((idx % 4) + 1).padStart(2, '0')}`,
      pastureId: row.pastureId,
      pastureName: row.pastureName,
      fatRate: round2(3.2 + (idx % 8) * 0.06),
      proteinRate: round2(3 + (idx % 7) * 0.05),
      somaticCell: somatic,
      status: abnormal ? 'ABNORMAL' : 'PASS',
      note: abnormal ? '体细胞偏高，建议复检' : ''
    })
  })

  const whs = warehouses.value.length ? warehouses.value : ['杭州总部中央仓', '上海华东RDC', '广州华南RDC']
  pastures.value.forEach((p, idx) => {
    for (let i = -2; i <= 4; i += 1) {
      const planned = 7600 + idx * 580 + (i + 2) * 100
      const executed = i < 0 ? planned : (i === 0 ? Math.round(planned * 0.7) : 0)
      shipmentRows.value.push({
        id: shipmentRows.value.length + 1,
        bizDate: addDays(today(), i),
        pastureId: Number(p.id),
        pastureName: p.name,
        targetWarehouse: whs[(idx + i + whs.length) % whs.length] || '杭州总部中央仓',
        plannedQty: planned,
        executedQty: executed,
        status: i < 0 ? 'DONE' : (i === 0 ? 'PARTIAL' : 'PLANNED')
      })
    }
  })

  pastures.value.slice(0, 4).forEach((p, idx) => {
    tempRows.value.push({
      id: tempRows.value.length + 1,
      bizDate: addDays(today(), -(idx + 1)),
      pastureId: Number(p.id),
      pastureName: p.name,
      temperature: round2(8.2 + idx * 1.4),
      minTemp: 2,
      maxTemp: 6,
      level: idx === 0 ? 'CRITICAL' : (idx === 1 ? 'HIGH' : 'MEDIUM'),
      responsible: idx <= 1 ? '冷链调度一组' : '仓配巡检组',
      status: idx === 3 ? 'CLOSED' : (idx === 2 ? 'PROCESSING' : 'OPEN'),
      description: '运输过程温度超阈值'
    })
  })

  const version = `FC-${today().replace(/-/g, '')}-A`
  pastures.value.forEach((p, idx) => {
    for (let i = -3; i <= 10; i += 1) {
      const forecastDate = addDays(today(), i)
      const predictedQty = round2((22000 + idx * 1500) * (1 + (i + 3) * 0.005))
      const actualQty = forecastDate <= today()
        ? round2(dailyRows.value
          .filter((r) => r.pastureId === Number(p.id) && r.bizDate === forecastDate)
          .reduce((sum, r) => sum + Number(r.outputQty || 0), 0))
        : 0
      forecastRows.value.push({
        id: forecastRows.value.length + 1,
        version,
        granularity: 'DAY',
        forecastDate,
        pastureName: p.name,
        predictedQty,
        actualQty
      })
    }
  })
}

const fetchPastures = async () => {
  loading.value = true
  try {
    const [pRes, wRes] = await Promise.all([
      axios.get('/pasture-stats'),
      axios.get('/warehouses')
    ])
    pastures.value = Array.isArray(pRes.data?.data) ? pRes.data.data : []
    warehouses.value = (Array.isArray(wRes.data?.data) ? wRes.data.data : [])
      .filter((w: any) => Number(w?.warehouse_type) !== 3 && Number(w?.status) === 1)
      .map((w: any) => String(w?.warehouse_name || ''))
      .filter(Boolean)
    bootstrap()
    await nextTick()
    renderCharts()
  } catch {
    ElMessage.error('加载牧场数据失败')
  } finally {
    loading.value = false
  }
}

const filteredDailyRows = computed(() => {
  let rows = [...dailyRows.value]
  if (dailyQuery.pastureId) rows = rows.filter((r) => Number(r.pastureId) === Number(dailyQuery.pastureId))
  if (dailyQuery.keyword.trim()) {
    const kw = dailyQuery.keyword.trim().toLowerCase()
    rows = rows.filter((r) => String(r.pastureName).toLowerCase().includes(kw) || String(r.note).toLowerCase().includes(kw))
  }
  return rows.sort((a, b) => String(b.bizDate).localeCompare(String(a.bizDate)))
})

const filteredQualityRows = computed(() => {
  let rows = [...qualityRows.value]
  if (qualityQuery.pastureId) rows = rows.filter((r) => Number(r.pastureId) === Number(qualityQuery.pastureId))
  if (qualityQuery.status) rows = rows.filter((r) => String(r.status) === String(qualityQuery.status))
  return rows.sort((a, b) => String(b.bizDate).localeCompare(String(a.bizDate)))
})

const filteredShipmentRows = computed(() => {
  let rows = [...shipmentRows.value]
  if (shipmentQuery.pastureId) rows = rows.filter((r) => Number(r.pastureId) === Number(shipmentQuery.pastureId))
  if (shipmentQuery.status) rows = rows.filter((r) => String(r.status) === String(shipmentQuery.status))
  return rows.sort((a, b) => String(a.bizDate).localeCompare(String(b.bizDate)))
})

const filteredTempRows = computed(() => {
  let rows = [...tempRows.value]
  if (tempQuery.level) rows = rows.filter((r) => String(r.level) === String(tempQuery.level))
  if (tempQuery.status) rows = rows.filter((r) => String(r.status) === String(tempQuery.status))
  return rows.sort((a, b) => String(b.bizDate).localeCompare(String(a.bizDate)))
})

const filteredForecastRows = computed(() => {
  let rows = [...forecastRows.value]
  if (forecastQuery.granularity) rows = rows.filter((r) => String(r.granularity) === String(forecastQuery.granularity))
  if (forecastQuery.version) rows = rows.filter((r) => String(r.version) === String(forecastQuery.version))
  return rows.sort((a, b) => String(b.forecastDate).localeCompare(String(a.forecastDate)))
})

const forecastVersions = computed(() => [...new Set(forecastRows.value.map((r) => String(r.version)))].sort().reverse())

const summaryCards = computed(() => {
  const todayOutput = dailyRows.value.filter((r) => r.bizDate === today()).reduce((sum, r) => sum + Number(r.outputQty || 0), 0)
  const abnormalBatchCount = qualityRows.value.filter((r) => r.status === 'ABNORMAL').length
  const totalPlan = shipmentRows.value.reduce((sum, r) => sum + Number(r.plannedQty || 0), 0)
  const totalExec = shipmentRows.value.reduce((sum, r) => sum + Number(r.executedQty || 0), 0)
  const openTemp = tempRows.value.filter((r) => r.status !== 'CLOSED').length
  return [
    { label: '当日产奶量(L)', value: todayOutput, tab: 'daily' },
    { label: '异常质检批次', value: abnormalBatchCount, tab: 'quality' },
    { label: '发运执行率(%)', value: totalPlan > 0 ? round2((totalExec / totalPlan) * 100) : 0, tab: 'shipment' },
    { label: '温控未闭环', value: openTemp, tab: 'temperature' },
    { label: '预测版本数', value: forecastVersions.value.length, tab: 'forecast' }
  ]
})

const outputTrend = computed(() => {
  const map = new Map<string, number>()
  dailyRows.value.forEach((r) => {
    if (r.bizDate < addDays(today(), -29)) return
    map.set(r.bizDate, Number(map.get(r.bizDate) || 0) + Number(r.outputQty || 0))
  })
  return [...map.entries()].map(([date, qty]) => ({ date, qty: round2(qty) })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
})

const qualityTrend = computed(() => {
  const map = new Map<string, { total: number, abnormal: number }>()
  qualityRows.value.forEach((r) => {
    if (r.bizDate < addDays(today(), -29)) return
    const cur = map.get(r.bizDate) || { total: 0, abnormal: 0 }
    cur.total += 1
    if (r.status === 'ABNORMAL') cur.abnormal += 1
    map.set(r.bizDate, cur)
  })
  return [...map.entries()].map(([date, item]) => ({ date, abnormalRate: item.total > 0 ? round2((item.abnormal / item.total) * 100) : 0 }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
})

const envWarnings = computed(() => {
  const rows = dailyRows.value.filter((r) => Number(r.envAqi) >= 45 || Number(r.envTemp) > 31 || Number(r.envHumidity) > 85)
  const map = new Map<string, number>()
  rows.forEach((r) => map.set(r.pastureName, Number(map.get(r.pastureName) || 0) + 1))
  return [...map.entries()].map(([pastureName, count]) => ({ pastureName, count })).sort((a, b) => b.count - a.count)
})

const renderCharts = () => {
  if (outputChartRef.value && !outputChart) outputChart = echarts.init(outputChartRef.value)
  if (qualityChartRef.value && !qualityChart) qualityChart = echarts.init(qualityChartRef.value)
  outputChart?.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: outputTrend.value.map((i) => i.date.slice(5)) },
    yAxis: { type: 'value' },
    series: [{ name: '产量', type: 'line', smooth: true, data: outputTrend.value.map((i) => i.qty), lineStyle: { color: '#2563eb' } }],
    grid: { left: 40, right: 20, top: 30, bottom: 26 }
  })
  qualityChart?.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: qualityTrend.value.map((i) => i.date.slice(5)) },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: [{ name: '异常率', type: 'bar', data: qualityTrend.value.map((i) => i.abnormalRate), barMaxWidth: 26, itemStyle: { color: '#f59e0b' } }],
    grid: { left: 40, right: 20, top: 30, bottom: 26 }
  })
}

const resizeCharts = () => {
  outputChart?.resize()
  qualityChart?.resize()
}

const addDaily = async () => {
  const pasture = pastures.value[0]
  if (!pasture) return ElMessage.warning('暂无牧场数据')
  const { value } = await ElMessageBox.prompt('请输入产奶量(L)', '记录生产日报', { inputPattern: /^\d+(\.\d+)?$/, inputErrorMessage: '请输入数字' })
  dailyRows.value.unshift({
    id: dailyRows.value.length + 1,
    bizDate: today(),
    pastureId: Number(pasture.id),
    pastureName: pasture.name,
    outputQty: Number(value || 0),
    deviceStatus: 'NORMAL',
    envTemp: 24,
    envHumidity: 63,
    envAqi: 32,
    note: ''
  })
  ElMessage.success('日报已记录')
}

const addQuality = async () => {
  const pasture = pastures.value[0]
  if (!pasture) return ElMessage.warning('暂无牧场数据')
  const { value } = await ElMessageBox.prompt('请输入体细胞指标', '录入质检批次', { inputPattern: /^\d+$/, inputErrorMessage: '请输入整数' })
  const somatic = Number(value || 0)
  qualityRows.value.unshift({
    id: qualityRows.value.length + 1,
    bizDate: today(),
    batchNo: `MB-${today().replace(/-/g, '')}-${String(pasture.id).padStart(3, '0')}-${String((qualityRows.value.length % 99) + 1).padStart(2, '0')}`,
    pastureId: Number(pasture.id),
    pastureName: pasture.name,
    fatRate: 3.22,
    proteinRate: 3.1,
    somaticCell: somatic,
    status: somatic > 280 ? 'ABNORMAL' : 'PASS',
    note: somatic > 280 ? '体细胞偏高，建议复检' : ''
  })
  ElMessage.success('质检批次已录入')
}

const addShipment = async () => {
  const pasture = pastures.value[0]
  if (!pasture) return ElMessage.warning('暂无牧场数据')
  const { value } = await ElMessageBox.prompt('请输入计划发运量(L)', '生成发运计划', { inputPattern: /^\d+(\.\d+)?$/, inputErrorMessage: '请输入数字' })
  shipmentRows.value.unshift({
    id: shipmentRows.value.length + 1,
    bizDate: today(),
    pastureId: Number(pasture.id),
    pastureName: pasture.name,
    targetWarehouse: warehouses.value[0] || '杭州总部中央仓',
    plannedQty: Number(value || 0),
    executedQty: 0,
    status: 'PLANNED'
  })
  ElMessage.success('发运计划已生成')
}

const executeShipment = async (row: ShipmentRow) => {
  const { value } = await ElMessageBox.prompt('请输入本次执行量', '执行发运', { inputPattern: /^\d+(\.\d+)?$/, inputErrorMessage: '请输入数字' })
  const qty = Number(value || 0)
  if (qty <= 0) return ElMessage.warning('执行量需大于0')
  row.executedQty = round2(Math.min(row.plannedQty, row.executedQty + qty))
  row.status = row.executedQty >= row.plannedQty ? 'DONE' : 'PARTIAL'
  ElMessage.success('执行量已更新')
}

const addTemp = async () => {
  const pasture = pastures.value[0]
  if (!pasture) return ElMessage.warning('暂无牧场数据')
  const { value } = await ElMessageBox.prompt('请输入异常温度(℃)', '登记温控异常', { inputPattern: /^\d+(\.\d+)?$/, inputErrorMessage: '请输入数字' })
  tempRows.value.unshift({
    id: tempRows.value.length + 1,
    bizDate: today(),
    pastureId: Number(pasture.id),
    pastureName: pasture.name,
    temperature: Number(value || 0),
    minTemp: 2,
    maxTemp: 6,
    level: Number(value || 0) > 9 ? 'CRITICAL' : 'HIGH',
    responsible: '冷链调度一组',
    status: 'OPEN',
    description: '人工登记异常'
  })
  ElMessage.success('温控异常已登记')
}

const handleTemp = (row: TempRow, status: 'PROCESSING' | 'CLOSED') => {
  row.status = status
  ElMessage.success(status === 'CLOSED' ? '异常已闭环' : '异常处理中')
}

const addForecast = async () => {
  const pasture = pastures.value[0]
  if (!pasture) return ElMessage.warning('暂无牧场数据')
  const { value } = await ElMessageBox.prompt('请输入预测版本号', '生成产能预测', { inputValue: `FC-${today().replace(/-/g, '')}-B` })
  const version = String(value || '').trim()
  if (!version) return ElMessage.warning('版本号不能为空')
  for (let i = 0; i < 14; i += 1) {
    const d = addDays(today(), i)
    const predicted = round2(22000 * (1 + i * 0.008))
    const actual = d <= today()
      ? round2(dailyRows.value.filter((r) => r.bizDate === d && r.pastureId === Number(pasture.id)).reduce((sum, r) => sum + Number(r.outputQty || 0), 0))
      : 0
    forecastRows.value.unshift({
      id: forecastRows.value.length + 1,
      version,
      granularity: 'DAY',
      forecastDate: d,
      pastureName: pasture.name,
      predictedQty: predicted,
      actualQty: actual
    })
  }
  ElMessage.success('预测版本已生成')
}

watch([outputTrend, qualityTrend], async () => {
  await nextTick()
  renderCharts()
}, { deep: true })

watch(() => activeTab.value, async () => {
  await nextTick()
  resizeCharts()
})

onMounted(async () => {
  await fetchPastures()
  window.addEventListener('resize', resizeCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  outputChart?.dispose()
  qualityChart?.dispose()
})
</script>

<template>
  <div class="pasture-page" v-loading="loading">
    <div class="head">
      <div>
        <h2>牧场与奶源运营中心</h2>
        <p>生产日报、质量管理、发运计划、温控闭环、产能预测一体化运营</p>
      </div>
      <el-button @click="fetchPastures">刷新</el-button>
    </div>

    <div class="summary">
      <div v-for="card in summaryCards" :key="card.label" class="summary-card" @click="activeTab = card.tab">
        <div class="k">{{ card.label }}</div>
        <div class="v">{{ card.label.includes('(%)') ? `${card.value}%` : formatNum(card.value) }}</div>
      </div>
    </div>

    <div class="board">
      <el-card shadow="never"><template #header>30日产量趋势</template><div ref="outputChartRef" class="chart"></div></el-card>
      <el-card shadow="never"><template #header>30天质检异常率</template><div ref="qualityChartRef" class="chart"></div></el-card>
      <el-card shadow="never">
        <template #header>环境预警</template>
        <div v-if="envWarnings.length" class="warn-list">
          <div v-for="row in envWarnings.slice(0, 8)" :key="row.pastureName" class="warn-item">
            <span>{{ row.pastureName }}</span>
            <el-tag type="danger">{{ row.count }}次</el-tag>
          </div>
        </div>
        <el-empty v-else description="暂无异常" />
      </el-card>
    </div>

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="生产日报" name="daily">
          <div class="toolbar">
            <el-input v-model="dailyQuery.keyword" placeholder="搜索牧场/异常说明" clearable style="width: 260px" />
            <el-select v-model="dailyQuery.pastureId" clearable placeholder="牧场" style="width: 160px">
              <el-option v-for="p in pastures" :key="p.id" :label="p.name" :value="Number(p.id)" />
            </el-select>
            <el-button type="primary" @click="addDaily">记录日报</el-button>
          </div>
          <el-table :data="filteredDailyRows" border height="420">
            <el-table-column prop="bizDate" label="日期" width="120" />
            <el-table-column prop="pastureName" label="牧场" min-width="140" />
            <el-table-column label="产奶量(L)" min-width="120"><template #default="{ row }">{{ formatNum(row.outputQty) }}</template></el-table-column>
            <el-table-column prop="deviceStatus" label="设备" width="120" />
            <el-table-column label="环境" min-width="220"><template #default="{ row }">T{{ row.envTemp }}℃ / H{{ row.envHumidity }}% / AQI {{ row.envAqi }}</template></el-table-column>
            <el-table-column prop="note" label="异常说明" min-width="180" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="质量管理" name="quality">
          <div class="toolbar">
            <el-select v-model="qualityQuery.pastureId" clearable placeholder="牧场" style="width: 160px"><el-option v-for="p in pastures" :key="p.id" :label="p.name" :value="Number(p.id)" /></el-select>
            <el-select v-model="qualityQuery.status" clearable placeholder="状态" style="width: 160px"><el-option label="合格" value="PASS" /><el-option label="异常" value="ABNORMAL" /></el-select>
            <el-button type="primary" @click="addQuality">录入质检</el-button>
          </div>
          <el-table :data="filteredQualityRows" border height="420">
            <el-table-column prop="bizDate" label="日期" width="120" />
            <el-table-column prop="batchNo" label="批次号" min-width="200" />
            <el-table-column prop="pastureName" label="牧场" min-width="140" />
            <el-table-column prop="fatRate" label="脂肪率" width="90" />
            <el-table-column prop="proteinRate" label="蛋白率" width="90" />
            <el-table-column prop="somaticCell" label="体细胞" width="100" />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column prop="note" label="备注" min-width="160" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="发运计划" name="shipment">
          <div class="toolbar">
            <el-select v-model="shipmentQuery.pastureId" clearable placeholder="牧场" style="width: 160px"><el-option v-for="p in pastures" :key="p.id" :label="p.name" :value="Number(p.id)" /></el-select>
            <el-select v-model="shipmentQuery.status" clearable placeholder="状态" style="width: 160px"><el-option label="已计划" value="PLANNED" /><el-option label="部分执行" value="PARTIAL" /><el-option label="已完成" value="DONE" /></el-select>
            <el-button type="primary" @click="addShipment">生成计划</el-button>
          </div>
          <el-table :data="filteredShipmentRows" border height="420">
            <el-table-column prop="bizDate" label="日期" width="120" />
            <el-table-column prop="pastureName" label="牧场" min-width="130" />
            <el-table-column prop="targetWarehouse" label="目标仓" min-width="160" />
            <el-table-column label="计划量" min-width="100"><template #default="{ row }">{{ formatNum(row.plannedQty) }}</template></el-table-column>
            <el-table-column label="执行量" min-width="100"><template #default="{ row }">{{ formatNum(row.executedQty) }}</template></el-table-column>
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button link type="primary" :disabled="row.status === 'DONE'" @click="executeShipment(row)">执行</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="温控异常" name="temperature">
          <div class="toolbar">
            <el-select v-model="tempQuery.level" clearable placeholder="等级" style="width: 160px"><el-option label="低" value="LOW" /><el-option label="中" value="MEDIUM" /><el-option label="高" value="HIGH" /><el-option label="严重" value="CRITICAL" /></el-select>
            <el-select v-model="tempQuery.status" clearable placeholder="状态" style="width: 160px"><el-option label="待处理" value="OPEN" /><el-option label="处理中" value="PROCESSING" /><el-option label="已关闭" value="CLOSED" /></el-select>
            <el-button type="primary" @click="addTemp">登记异常</el-button>
          </div>
          <el-table :data="filteredTempRows" border height="420">
            <el-table-column prop="bizDate" label="日期" width="120" />
            <el-table-column prop="pastureName" label="牧场" min-width="130" />
            <el-table-column label="温度" min-width="170"><template #default="{ row }">{{ row.temperature }}℃ ({{ row.minTemp }}~{{ row.maxTemp }}℃)</template></el-table-column>
            <el-table-column prop="level" label="等级" width="90" />
            <el-table-column prop="responsible" label="责任组" min-width="130" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="操作" width="170" fixed="right"><template #default="{ row }"><el-button link type="warning" :disabled="row.status !== 'OPEN'" @click="handleTemp(row, 'PROCESSING')">处理</el-button><el-button link type="success" :disabled="row.status === 'CLOSED'" @click="handleTemp(row, 'CLOSED')">闭环</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="产能预测" name="forecast">
          <div class="toolbar">
            <el-select v-model="forecastQuery.granularity" clearable placeholder="粒度" style="width: 160px"><el-option label="天" value="DAY" /><el-option label="周" value="WEEK" /><el-option label="月" value="MONTH" /></el-select>
            <el-select v-model="forecastQuery.version" clearable placeholder="版本" style="width: 220px"><el-option v-for="v in forecastVersions" :key="v" :label="v" :value="v" /></el-select>
            <el-button type="primary" @click="addForecast">生成版本</el-button>
          </div>
          <el-table :data="filteredForecastRows" border height="420">
            <el-table-column prop="version" label="版本" min-width="170" />
            <el-table-column prop="granularity" label="粒度" width="90" />
            <el-table-column prop="forecastDate" label="预测日期" width="120" />
            <el-table-column prop="pastureName" label="牧场" min-width="120" />
            <el-table-column label="预测产量" min-width="110"><template #default="{ row }">{{ formatNum(row.predictedQty) }}</template></el-table-column>
            <el-table-column label="实际产量" min-width="110"><template #default="{ row }">{{ formatNum(row.actualQty) }}</template></el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.pasture-page { display: flex; flex-direction: column; gap: 14px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.head h2 { margin: 0; font-size: 20px; color: #0f172a; }
.head p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
.summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.summary-card { border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 12px; cursor: pointer; }
.summary-card:hover { border-color: #93c5fd; box-shadow: 0 8px 16px rgba(37, 99, 235, 0.08); }
.summary-card .k { color: #475569; font-size: 12px; }
.summary-card .v { margin-top: 6px; font-size: 24px; font-weight: 700; color: #0f172a; }
.board { display: grid; grid-template-columns: 1fr 1fr 0.9fr; gap: 12px; }
.chart { width: 100%; height: 210px; }
.warn-list { display: flex; flex-direction: column; gap: 10px; max-height: 210px; overflow: auto; }
.warn-item { display: flex; align-items: center; justify-content: space-between; border: 1px solid #fee2e2; border-radius: 8px; background: #fff1f2; padding: 8px 10px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 10px; }
@media (max-width: 1360px) { .summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } .board { grid-template-columns: 1fr; } }
@media (max-width: 960px) { .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .toolbar { flex-wrap: wrap; } }
</style>
