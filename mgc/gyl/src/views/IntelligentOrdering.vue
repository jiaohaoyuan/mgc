<!-- 这个文件是什么作用显示的是什么：这是智能订货中心页面。显示/实现的是：基于数据可视化的地图、各区域发货状态以及智能订货建议视图。 -->
<script setup lang="ts">
/**
 * 智能订购与调度 (Intelligent Ordering) 原型页面 (已接入真实后端)
 * 包含：地图调度看板、AI匹配算法权重配置、智能单处理列表、分页加载
 */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import * as echarts from 'echarts'
import chinaJson from '@/assets/china.json'

echarts.registerMap('china', chinaJson as any)
import {
  Location,
  Van,
  ShoppingCart,
  Cpu,
  Tickets,
  MapLocation,
  OfficeBuilding,
  LocationFilled,
  QuestionFilled
} from '@element-plus/icons-vue'

// --- API 地址 ---
const API_BASE = 'http://localhost:3000/api'

// --- 数据状态容器 ---
const products = ref<any[]>([])
const pastures = ref<any[]>([])
const distributors = ref<any[]>([])
const inventories = ref<any[]>([])

// 订单分页与列表
const orders = ref<any[]>([])
const totalOrders = ref(0)
const currentPage = ref(1)
const pageSize = ref(15)
const loadingOrders = ref(false)

// 页面权限与匹配参数控制
const currentUserLevel = ref('L1')
const alpha = ref(1.0)
const beta = ref(1.5)

// 地图实例
let chartMapInstance: echarts.ECharts | null = null
const mapContainerRef = ref<HTMLElement | null>(null)

// 触发重新居中
const resetMap = () => {
  if (chartMapInstance) {
    chartMapInstance.dispatchAction({
      type: 'restore'
    });
  }
}

// --- 数据获取与初始化逻辑 ---

const fetchData = async () => {
    try {
        // 1. 获取商品主数据
        const proRes = await axios.get(`${API_BASE}/products`)
        products.value = proRes.data.data

        // 2. 获取仓库数据 (分离出牧场和终端网点)
        const whRes = await axios.get(`${API_BASE}/warehouses`)
        const warehouses = whRes.data.data || []
        
        pastures.value = warehouses
            .filter((w: any) => w.warehouse_type === 3)
            .map((p: any) => ({
                id: p.id,
                name: p.warehouse_name,
                lat: parseFloat(p.latitude || 0),
                lng: parseFloat(p.longitude || 0),
                coldStorageStatus: Math.random() > 0.1 ? 'Normal' : 'Maintenance' // 随机状态
            }))

        distributors.value = warehouses
            .filter((w: any) => w.warehouse_type === 4 || w.warehouse_type === 1 || w.warehouse_type === 2)
            .map((d: any) => ({
                id: d.id,
                name: d.warehouse_name,
                level: d.contact_person || 'L3',  // fallback
                lat: parseFloat(d.latitude || 0),
                lng: parseFloat(d.longitude || 0),
                warehouse_type: d.warehouse_type
            }))
            
        // 3. 初始拉取订单
        await fetchOrders()
        
    } catch (err) {
        ElMessage.error('无法连接到后端 API，请检查 Node.js 服务是否运行并在 3000 端口')
        console.error(err)
    }
}

const fetchOrders = async () => {
    loadingOrders.value = true
    try {
        const res = await axios.get(`${API_BASE}/orders?page=${currentPage.value}&limit=${pageSize.value}`)
        if (res.data.code === 200) {
            totalOrders.value = res.data.data.total
            // 将蛇形命名转为驼峰适应原有逻辑
            orders.value = res.data.data.list.map((o: any) => ({
                ...o,
                orderId: o.order_id,
                distributorId: o.distributor_id,
                skuId: o.sku_id,
                requestLiters: parseFloat(o.request_liters),
                sourcePastureId: o.source_pasture_id,
                matchScore: parseFloat(o.match_score),
                createTime: o.create_time
            }))
        }
    } catch (err) {
        ElMessage.error('订单拉取失败')
    } finally {
        loadingOrders.value = false
    }
}

const handlePageChange = (page: number) => {
    currentPage.value = page
    fetchOrders()
}

// --- 订单分析区域数据 ---
const analysis = ref<any>(null)
const chartRegionRef = ref<HTMLElement | null>(null)
const chartTrendRef = ref<HTMLElement | null>(null)
let chartRegionInstance: echarts.ECharts | null = null
let chartTrendInstance: echarts.ECharts | null = null

const fetchAnalysis = async () => {
  try {
    const res = await axios.get(`${API_BASE}/order-analysis`)
    if (res.data.code === 200) {
      analysis.value = res.data.data
      await nextTick()
      renderCharts()
    }
  } catch (err) {
    console.warn('订单分析接口不可用')
  }
}

const renderCharts = () => {
  // 四大区域需求饱和图 (柱状图  + 饼图并排)
  if (chartRegionRef.value) {
    chartRegionInstance = chartRegionInstance || echarts.init(chartRegionRef.value, 'dark')
    const regions = Object.keys(analysis.value.regionStats)
    const values = Object.values(analysis.value.regionStats) as number[]
    const total = values.reduce((a, b) => a + b, 0)
    chartRegionInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}<br/>需求量: <b>${(p[0].value / 10000).toFixed(1)}万L</b>` },
      grid: { left: 36, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: regions, axisLabel: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold' }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: (v: number) => `${(v/10000).toFixed(0)}万L` }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        type: 'bar', data: values, barMaxWidth: 60,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: (params: any) => {
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
            return colors[params.dataIndex % colors.length]
          }
        },
        label: { show: true, position: 'top', color: '#94a3b8', formatter: (p: any) => `${((p.value / total) * 100).toFixed(1)}%` }
      }]
    })
  }

  // 7天涋出货量趋势图
  if (chartTrendRef.value) {
    chartTrendInstance = chartTrendInstance || echarts.init(chartTrendRef.value, 'dark')
    const trend = analysis.value.sevenDayTrend
    chartTrendInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].axisValue}<br/>出货量: <b>${(p[0].value / 10000).toFixed(2)}万L</b>` },
      grid: { left: 52, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: trend.map((d: any) => d.date), axisLabel: { color: '#94a3b8' }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: (v: number) => `${(v/10000).toFixed(0)}万L` }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        type: 'line', data: trend.map((d: any) => d.liters), smooth: true,
        symbol: 'circle', symbolSize: 8,
        lineStyle: { color: '#38bdf8', width: 3 },
        itemStyle: { color: '#38bdf8', borderWidth: 2, borderColor: '#0f172a' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(56,189,248,0.3)' }, { offset: 1, color: 'rgba(56,189,248,0.02)' }] } }
      }]
    })
  }
}

onMounted(() => {
    fetchData()
    fetchAnalysis()
})

onUnmounted(() => {
  chartRegionInstance?.dispose()
  chartTrendInstance?.dispose()
})

// 前端权限过滤（千级数据量下最好由后端过滤，这里做视图层简易演示）
const filteredOrders = computed(() => {
  if (currentUserLevel.value === 'L3') {
    return orders.value.filter(o => o.distributorId === 'D_L3_BJ_CY')
  }
  return orders.value
})

// 动态连线：只显示流向 L1/L2 节点的业务线
const activeFlows = computed(() => {
  return filteredOrders.value
    .filter(o => o.status === 'Matched' && o.sourcePastureId)
    .map(o => {
      const p = pastures.value.find(x => x.id === o.sourcePastureId)
      const d = distributors.value.find(x => x.id === o.distributorId && (x.warehouse_type === 1 || x.warehouse_type === 2))
      if (p && d && p.lng && d.lng) {
        return {
          coords: [[p.lng, p.lat], [d.lng, d.lat]]
        }
      }
      return null
    }).filter(Boolean).slice(0, 30) as any[] // 保持 30 条核心连线，确保动画流畅
})

// 地图只展示 L1 总部和 L2 RDC 大区中心 (均有真实经纬度)
const renderDistributors = computed(() =>
  distributors.value.filter(d => d.warehouse_type === 1 || d.warehouse_type === 2)
)

// --- 地图渲染核心逻辑 ---
const renderMap = () => {
  if (!chartMapInstance && mapContainerRef.value) {
    chartMapInstance = echarts.init(mapContainerRef.value, 'dark')
    chartMapInstance.on('click', (params: any) => {
      // 点击牧场或核心仓时，显示详情
      if ((params.seriesType === 'scatter' || params.seriesType === 'effectScatter') && params.data && params.data.id) {
        showPastureDetail(params.data.id)
      }
    })
  }
  if (!chartMapInstance) return

  // 整理 牧场(前置仓) 数据 -> 蓝色
  const pastureSeriesData = pastures.value.map(p => ({
    id: p.id,
    name: p.name,
    value: [p.lng, p.lat, 1], // [lng, lat, value]
    itemStyle: { color: '#38bdf8', shadowBlur: 10, shadowColor: '#38bdf8' }
  }))

  // 整理 L1 总部数据 -> 金色发光
  const hqSeriesData = renderDistributors.value.filter(d => d.warehouse_type === 1).map(d => ({
    id: d.id,
    name: d.name,
    value: [d.lng, d.lat, 1],
    itemStyle: { color: '#fbbf24', shadowBlur: 20, shadowColor: '#fbbf24' }
  }))

  // 整理 L2 RDC 数据 -> 橙色
  const rdcSeriesData = renderDistributors.value.filter(d => d.warehouse_type === 2).map(d => ({
    id: d.id,
    name: d.name,
    value: [d.lng, d.lat, 1],
    itemStyle: { color: '#f97316', shadowBlur: 10, shadowColor: '#f97316' }
  }))

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.seriesType === 'lines') return ''
        return `<b>${params.name}</b><br/>类型: ${params.seriesName}`
      }
    },
    geo: {
      map: 'china',
      roam: true, // 开启鼠标缩放和平移漫游，实现“跟地图软件一样能缩放”
      zoom: 1.2,
      label: {
        show: false, // 不显示省份名称以保持简洁
        color: 'rgba(255,255,255,0.5)'
      },
      itemStyle: {
        areaColor: '#0f172a',
        borderColor: '#38bdf8',
        borderWidth: 1
      },
      emphasis: {
        itemStyle: {
          areaColor: '#1e293b'
        },
        label: { show: false }
      }
    },
    series: [
      {
        name: '牧场 / 前置仓',
        type: 'scatter',
        coordinateSystem: 'geo',
        data: pastureSeriesData,
        symbolSize: 8,
      },
      {
        name: 'L2 RDC大区中心',
        type: 'scatter', // 也可以用 effectScatter
        coordinateSystem: 'geo',
        data: rdcSeriesData,
        symbolSize: 10,
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: '#e2e8f0',
          fontSize: 10
        }
      },
      {
        name: 'L1 鲜链总部',
        type: 'effectScatter', // 发光动画波纹
        coordinateSystem: 'geo',
        data: hqSeriesData,
        symbolSize: 16,
        showEffectOn: 'render',
        rippleEffect: {
          brushType: 'fill',
          scale: 4
        },
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: '#fbbf24',
          fontSize: 12,
          fontWeight: 'bold'
        },
        zlevel: 1
      },
      {
        name: '智能调度动线',
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 2,
        effect: {
          show: true,
          period: 4,
          trailLength: 0.2, // 尾迹长度
          color: '#10b981',
          symbol: 'arrow',
          symbolSize: 5
        },
        lineStyle: {
          color: '#10b981',
          width: 2,
          opacity: 0.1, // 主干线淡一点，主要看动画光效
          curveness: 0.3 // 曲线美化
        },
        data: activeFlows.value
      }
    ]
  }

  chartMapInstance.setOption(option)
}

// 监听数据变化重新渲染地图
watch([pastures, renderDistributors, activeFlows], () => {
  nextTick(() => {
    renderMap()
  })
}, { deep: true })


const getSkuDetails = (skuId: string) => products.value.find(s => s.product_code === skuId)
const getDistributorName = (dId: string) => distributors.value.find(d => d.id === dId)?.name

// --- 一键智能匹配 ---
const handleAutoMatch = (row: any) => {
  // 原型演示：在没有后端复杂服务支撑的情况下，本地随机给予结果 (可改写调后端)
  const pastureTarget = pastures.value[Math.floor(Math.random() * pastures.value.length)]
  const score = (Math.random() * 20 + 80).toFixed(1)
  
  const target = orders.value.find(o => o.orderId === row.orderId)
  if (target) {
    target.status = 'Matched'
    target.sourcePastureId = pastureTarget?.id
    target.matchScore = score
    ;(target as any)._freshnessRemaining = Math.floor(Math.random() * 70 + 10)
    ElMessage.success(`订单 ${row.orderId} ✨AI匹配成功: ${pastureTarget?.name} (评分: ${score})`)
  }
}

// 牧场实况弹窗
const pastureDialogVisible = ref(false)
const selectedPasture = ref<any>(null)

const showPastureDetail = (pastureId: string) => {
  const p = pastures.value.find(p => p.id === pastureId)
  if (p) {
    selectedPasture.value = p
    pastureDialogVisible.value = true
  }
}

// 获取新鲜度进度条百分比与状态标识
const getFreshnessProps = (row: any) => {
  const sku = getSkuDetails(row.skuId)
  if (!sku || sku.material_type !== 'LowTemp') return null
  if (row.status === 'Pending') return null
  
  let remainingHours = row._freshnessRemaining || 48
  const shelfLifeHours = sku.shelf_life * 24
  
  const percent = Number(((remainingHours / shelfLifeHours) * 100).toFixed(0))
  const isDanger = percent < 30
  
  return {
    percent: Math.min(100, percent),
    remainingHours: remainingHours.toFixed(1),
    isDanger,
    color: isDanger ? '#ef4444' : '#10b981'
  }
}

</script>

<template>
  <div>
    <!-- 智能看板区域 -->
    <el-row :gutter="20" style="margin-bottom: 20px">
      <!-- "伪地图" API 调度看板 (原型用深色背景及关键节点模拟) -->
      <el-col :span="16">
        <div class="map-board">
          <div class="map-header">
            <h3><el-icon><Location /></el-icon> 鲜链 (Fresh-Link) 全国网点大盘 (<span style="color:#10b981; font-weight: bold;">{{ distributors.length }}</span> 个终端节点)</h3>
            <div class="map-controls">
                <el-button size="small" circle icon="Refresh" @click="resetMap" title="重置视角"></el-button>
                <span class="live-tag"><span></span>LIVE</span>
            </div>
          </div>
          <div class="map-viewport" ref="mapContainerRef" style="width: 100%; height: 100%; position: relative;">
          </div>
        </div>
      </el-col>

      <!-- 匹配因子配置区域 -->
      <el-col :span="8">
        <div class="config-board page-card">
          <div class="page-card-title" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
            <div><el-icon><Cpu /></el-icon> AI 决策引擎网络态势</div>
            <el-tooltip effect="dark" placement="left">
              <template #content>
                 <div style="line-height: 1.8; font-size: 13px;">
                  <strong style="color: #38bdf8;">核心匹配降维算法 (Scoring Formula):</strong><br/>
                  <span style="font-family: monospace; font-size: 14px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">
                    Score = (100 - Dist × α) + (Freshness × β) + Bias
                  </span><br/><br/>
                  <div style="color: #cbd5e1;">
                    • <strong>距离权重 (α)</strong>: 值越大，物理距离对匹配得分的<strong>扣减(惩罚)</strong>越严重。<br/>
                    • <strong>新鲜度溢价 (β)</strong>: 值越大，距离保质期越近的货物会被<strong>优先高分发货</strong>。<br/>
                    • <strong>网点等级 (Bias)</strong>: L1>L2>L3，高优网点天然拥有优先调度权。
                  </div>
                </div>
              </template>
              <el-icon style="cursor: pointer; font-size: 16px; color: #94a3b8; transition: color 0.2s;" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>

          <!-- 统计摘要 -->
          <div class="stats-mini">
              <div class="stat-box">
                  <span class="label">等待调度网点数 / 笔</span>
                  <span class="val">{{ totalOrders - 350 }}</span>
              </div>
              <div class="stat-box">
                  <span class="label">全网完成匹配数</span>
                  <span class="val success">350</span> 
              </div>
          </div>
          
          <div class="factor-item">
            <div class="factor-header">
              <span>距离权重 (Distance | α)</span>
              <span class="val">{{ alpha }}</span>
            </div>
            <el-slider v-model="alpha" :min="0.1" :max="3.0" :step="0.1" />
          </div>
          
          <div class="factor-item">
            <div class="factor-header">
              <span>新鲜度溢价 (Freshness | β)</span>
              <span class="val">{{ beta }}</span>
            </div>
            <el-slider v-model="beta" :min="0.1" :max="3.0" :step="0.1" />
          </div>
          
          <div style="margin-top: 30px; text-align: right">
            <el-radio-group v-model="currentUserLevel" size="small">
              <el-radio-button value="L1">L1 视角全局</el-radio-button>
              <el-radio-button value="L3">L3 视角单门店</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 订单分析区域 -->
    <el-row :gutter="20" style="margin-bottom: 20px" v-if="analysis">
      <!-- 四大区需求对比 -->
      <el-col :span="12">
        <div class="analysis-card">
          <div class="analysis-card-title">
            <span>&#128202; 四大区域订单需求量对比</span>
            <span class="analysis-sub">华东 / 华中 / 华南 / 华北 (万升)</span>
          </div>
          <div ref="chartRegionRef" style="height: 200px;" />
        </div>
      </el-col>
      <!-- 7日出货趋势 -->
      <el-col :span="12">
        <div class="analysis-card">
          <div class="analysis-card-title">
            <span>&#128200; 近 7 日全网历史出货趋势 (万升)</span>
            <div class="kpi-badges">
              <span class="kpi-badge blue">总订单<strong>{{ analysis.totalOrders }}</strong>笔</span>
              <span class="kpi-badge green">总出货量<strong>{{ (analysis.totalLiters / 10000).toFixed(1) }}</strong>万L</span>
            </div>
          </div>
          <div ref="chartTrendRef" style="height: 200px;" />
        </div>
      </el-col>
    </el-row>

    <!-- 订单列表 (带分页) -->
    <div class="page-card">
      <div class="page-card-header">
        <div class="page-card-title">
          <el-icon><Tickets /></el-icon> 订购调度处理清单 (当前实时页)
        </div>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalOrders"
          @current-change="handlePageChange"
          layout="total, prev, pager, next"
          background
          size="small"
        />
      </div>
      
      <el-table :data="filteredOrders" style="width: 100%" border stripe v-loading="loadingOrders">
        <el-table-column prop="orderId" label="订单号" width="150" />
        <el-table-column label="经销商 / 渠道 / 下属网点" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div style="font-weight: 500; font-size: 13px;">{{ getDistributorName(row.distributorId) || '门店载入中..' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订购大类 & SKU" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-tag :type="getSkuDetails(row.skuId)?.material_type === 'LowTemp' ? 'primary' : 'warning'" size="small">
                {{ getSkuDetails(row.skuId)?.material_type === 'LowTemp' ? '低温鲜奶' : '常温系列' }}
              </el-tag>
              <span style="font-size: 13px">{{ getSkuDetails(row.skuId)?.product_name || row.skuId }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="需求量(L)" width="100" prop="requestLiters" align="right">
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 14px">{{ row.requestLiters }}</span>
          </template>
        </el-table-column>
        <el-table-column label="调度状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'Pending'" type="info" effect="plain" round size="small">待分配</el-tag>
            <el-tag v-else-if="row.status === 'Matched'" type="success" effect="dark" round size="small">已分配</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发货来源牧场/核心仓" min-width="150" align="center">
          <template #default="{ row }">
            <span v-if="!row.sourcePastureId" style="color: var(--text-muted)">-</span>
            <el-button v-else link type="primary" size="small" @click="showPastureDetail(row.sourcePastureId)">
              <el-icon style="margin-right: 4px"><MapLocation /></el-icon>
              {{ pastures.find(p => p.id === row.sourcePastureId)?.name || '虚拟前置仓' }}
            </el-button>
          </template>
        </el-table-column>
        
         <el-table-column label="新鲜度预估指标" width="130" align="center">
          <template #default="{ row }">
            <div v-if="getFreshnessProps(row)">
               <el-progress 
                :percentage="getFreshnessProps(row)?.percent" 
                :color="getFreshnessProps(row)?.color" 
                :stroke-width="5"
                striped 
                striped-flow 
              />
            </div>
            <span v-else style="color: var(--text-muted); font-size: 12px">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作 / 引擎" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'Pending'" type="primary" size="small" @click="handleAutoMatch(row)">
              <el-icon><Cpu /></el-icon> 调度
            </el-button>
            <span v-else style="font-size: 11px; color: #10b981; font-weight: 500;">
              ✨分配完成
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    
    <!-- 牧场实况对话框 -->
    <el-dialog v-model="pastureDialogVisible" :title="'🔴 牧场/前置仓实况节点 - ' + selectedPasture?.name" width="400px">
      <div v-if="selectedPasture" class="pasture-details">
        <div class="coord-label">卫星坐标：Lat {{ selectedPasture.lat }}, Lng {{ selectedPasture.lng }}</div>
        <div class="status-grid">
          <div class="status-card">
            <h4>冷链负荷状态</h4>
            <el-tag :type="selectedPasture.coldStorageStatus === 'Normal' ? 'success' : 'danger'" effect="dark">
              {{ selectedPasture.coldStorageStatus === 'Normal' ? '正常制冷且富余' : '负荷较高报警' }}
            </el-tag>
          </div>
          <div class="status-card">
            <h4>当前可用库存SKU</h4>
            <div style="font-size: 18px; font-weight: bold; color: var(--primary-color)">152+ 款</div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 伪地图样式 */
.map-board {
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  height: 380px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
}

.map-header {
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(8px);
  z-index: 20;
}

.map-controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.zoom-val {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-family: monospace;
    min-width: 40px;
}

.live-tag {
  color: #ef4444;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 6px;
}

.map-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #020617;
}

.map-content {
  position: absolute;
  top: 0; left: 0; 
  width: 100%; height: 100%;
  transform-origin: center center;
  transition: transform 0.1s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
  transform-style: preserve-3d; /* 启用GPU加速 */
}

.map-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url('@/assets/china_map.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.6;
  filter: saturate(1.4) brightness(0.9) contrast(1.1);
}

.map-grid {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-size: 50px 50px;
  background-image: 
    linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
}

.map-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 8px; /* 字体更小以适应千级 */
  color: rgba(255,255,255,0.9);
  z-index: 10;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0.8;
  will-change: transform, opacity;
}

.map-marker:hover {
    transform: translate(-50%, -50%) scale(2);
    z-index: 50;
    opacity: 1;
    filter: drop-shadow(0 0 8px currentColor);
}

.help-icon:hover {
    color: #38bdf8 !important;
}

.map-marker.pasture {
  color: #38bdf8;
}

.map-marker.distributor {
  color: #fbbf24;
  font-size: 11px;
  flex-direction: column;
  align-items: center;
}

/* 标记图标圆面 */
.marker-node {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  box-shadow: 0 0 10px currentColor;
}

/* L1 总部: 金色 */
.hq-node {
  background: radial-gradient(circle, #fbbf24, #d97706);
  color: #fff;
  width: 34px;
  height: 34px;
  font-size: 16px;
  border-color: #fbbf24;
  animation: hq-pulse 2s ease-in-out infinite alternate;
}

/* L2 RDC: 橙色 */
.rdc-node {
  background: radial-gradient(circle, #f97316, #c2410c);
  color: #fff;
  border-color: #f97316;
}

/* 标记文字标签 */
.marker-label {
  margin-top: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #e2e8f0;
  background: rgba(15,23,42,0.8);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

@keyframes hq-pulse {
  0% { box-shadow: 0 0 8px #fbbf24; }
  100% { box-shadow: 0 0 20px #fbbf24, 0 0 40px rgba(251,191,36,0.4); }
}

.ping {
  position: absolute;
  top: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: rgba(56, 189, 248, 0.6);
  animation: ping-mark 3s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.map-svg {
  position: absolute;
  top: 0; left: 0;
  pointer-events: none;
  z-index: 5;
}

.flow-line {
  fill: none;
  stroke: rgba(16, 185, 129, 0.2);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
}

.flow-line.active {
  stroke: #10b981;
  stroke-dasharray: 8 4;
  animation: dash 30s linear infinite;
  stroke-width: 2;
}

@keyframes ping-mark {
  0% { transform: scale(1); opacity: 0.8; }
  75%, 100% { transform: scale(4); opacity: 0; }
}

@keyframes dash {
  from { stroke-dashoffset: 1000; }
  to { stroke-dashoffset: 0; }
}

/* 参数面板 */
.config-board {
  height: 380px;
  margin-bottom: 0 !important;
  display: flex;
  flex-direction: column;
}

.stats-mini {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
}

.stat-box {
    flex: 1;
    background: #f8fafc;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    text-align: center;
}

.stat-box .label {
    display: block;
    font-size: 11px;
    color: #64748b;
    margin-bottom: 4px;
}

.stat-box .val {
    font-size: 20px;
    font-weight: 800;
    color: #1e293b;
    font-family: monospace;
}

.stat-box .val.success {
    color: #10b981;
}

.factor-item {
  margin-bottom: 20px;
}

.factor-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.factor-header .val {
  color: var(--primary-color);
  font-family: monospace;
  font-size: 15px;
}

.coord-label {
  font-family: monospace;
  background: #f1f5f9;
  padding: 8px 12px;
  border-radius: 6px;
  color: #475569;
  margin-bottom: 16px;
  text-align: center;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.status-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.status-card h4 {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 8px 0;
  font-weight: 500;
}

/* 订单分析双图卡片 */
.analysis-card {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  padding: 16px 20px;
  border: 1px solid rgba(56, 189, 248, 0.12);
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.analysis-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.analysis-sub {
  font-size: 11px;
  color: #64748b;
  font-weight: normal;
}

.kpi-badges {
  display: flex;
  gap: 8px;
}

.kpi-badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 20px;
  color: #e2e8f0;
}

.kpi-badge.blue {
  background: rgba(59,130,246,0.2);
  border: 1px solid rgba(59,130,246,0.4);
}

.kpi-badge.green {
  background: rgba(16,185,129,0.2);
  border: 1px solid rgba(16,185,129,0.4);
}

.kpi-badge strong {
  margin: 0 3px;
  font-size: 14px;
}
</style>
