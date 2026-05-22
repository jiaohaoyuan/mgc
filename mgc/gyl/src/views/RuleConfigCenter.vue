<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const appStore = useAppStore()
const isSuperAdmin = computed(() => appStore.isSuperAdmin)

const activeTab = ref('freshness')

// ===== Freshness Rules =====
const freshnessLoading = ref(false)
const freshnessRows = ref<any[]>([])
const freshnessTotal = ref(0)
const freshnessPage = ref(1)
const freshnessPageSize = ref(15)
const freshnessKeyword = ref('')

const freshnessDialog = ref(false)
const freshnessSaving = ref(false)
const editingFreshnessId = ref<number | null>(null)
const freshnessForm = reactive({
  rule_code: '',
  rule_name: '',
  temperature_zone: 0,
  min_remaining_days: 0,
  max_remaining_days: 9999,
  allowed_scope: 2,
  allocation_ratio: 0,
  force_fefo: false,
  min_delivery_ratio: 0,
  priority: 99,
  status: 1,
  remark: ''
})

const TEMPERATURE_ZONES: Record<number, string> = { 0: '全部温层', 1: '常温', 2: '冷藏', 3: '冷冻' }
const ALLOWED_SCOPES: Record<number, string> = { 0: '本省', 1: '邻省', 2: '全国' }
const freshnessPreviewSku = ref('')
const freshnessPreviewQty = ref(100)
const freshnessPreviewLoading = ref(false)
const freshnessPreviewRows = ref<any[]>([])
const freshnessPreviewSkus = ref<any[]>([])
const freshnessScopeMode = ref<'PRODUCT' | 'CATEGORY'>('CATEGORY')
const freshnessScopeTree = ref<any[]>([
  {
    id: 'cat-l3',
    label: '三级品类',
    children: [
      { id: 'CAT-L3-UHT', label: '常温纯奶' },
      { id: 'CAT-L3-PASTEUR', label: '巴氏鲜奶' },
      { id: 'CAT-L3-CHILLED-YOG', label: '低温酸奶' },
      { id: 'CAT-L3-RTD-YOG', label: '常温酸奶' },
      { id: 'CAT-L3-ADULT-POWDER', label: '成人奶粉' },
      { id: 'CAT-L3-CHILD-POWDER', label: '儿童奶粉' },
      { id: 'CAT-L3-MIDDLE-POWDER', label: '中老年奶粉' }
    ]
  }
])
const freshnessScopeChecked = ref<string[]>([])

const fetchFreshnessRules = async () => {
  freshnessLoading.value = true
  try {
    const { data } = await axios.get('/rules/freshness', {
      params: { page: freshnessPage.value, pageSize: freshnessPageSize.value, keyword: freshnessKeyword.value || undefined }
    })
    if (data.code === 200) {
      freshnessRows.value = data.data.list || []
      freshnessTotal.value = data.data.total || 0
    }
  } catch (e: any) {
    ElMessage.error('获取新鲜度规则失败')
  } finally {
    freshnessLoading.value = false
  }
}

const openFreshnessDialog = (row?: any) => {
  if (row) {
    editingFreshnessId.value = row.id
    Object.assign(freshnessForm, {
      rule_code: row.rule_code, rule_name: row.rule_name, temperature_zone: row.temperature_zone,
      min_remaining_days: row.min_remaining_days, max_remaining_days: row.max_remaining_days,
      allowed_scope: row.allowed_scope, allocation_ratio: row.allocation_ratio ?? row.min_delivery_ratio ?? 0, force_fefo: row.force_fefo,
      min_delivery_ratio: row.min_delivery_ratio, priority: row.priority,
      status: row.status, remark: row.remark || ''
    })
  } else {
    editingFreshnessId.value = null
    Object.assign(freshnessForm, {
      rule_code: '', rule_name: '', temperature_zone: 0, min_remaining_days: 0,
      max_remaining_days: 9999, allowed_scope: 2, allocation_ratio: 0, force_fefo: false,
      min_delivery_ratio: 0, priority: 99, status: 1, remark: ''
    })
  }
  freshnessDialog.value = true
}

const saveFreshness = async () => {
  if (!freshnessForm.rule_code || !freshnessForm.rule_name) return ElMessage.warning('规则编码和名称必填')
  freshnessSaving.value = true
  try {
    if (editingFreshnessId.value) {
      await axios.put(`/rules/freshness/${editingFreshnessId.value}`, freshnessForm)
    } else {
      await axios.post('/rules/freshness', freshnessForm)
    }
    ElMessage.success(editingFreshnessId.value ? '更新成功' : '新增成功')
    freshnessDialog.value = false
    fetchFreshnessRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '保存失败')
  } finally {
    freshnessSaving.value = false
  }
}

const loadFreshnessPreview = async () => {
  if (!freshnessPreviewSku.value) return
  freshnessPreviewLoading.value = true
  try {
    const { data } = await axios.get('/rules/freshness-allocation-preview', {
      params: {
        sku_code: freshnessPreviewSku.value,
        temperature_zone: freshnessForm.temperature_zone,
        total_qty: freshnessPreviewQty.value
      }
    })
    freshnessPreviewRows.value = data?.data?.rows || []
  } catch {
    freshnessPreviewRows.value = []
  } finally {
    freshnessPreviewLoading.value = false
  }
}

const deleteFreshness = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除规则 ${row.rule_name} 吗？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await axios.delete(`/rules/freshness/${row.id}`)
    ElMessage.success('删除成功')
    fetchFreshnessRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '删除失败')
  }
}

// ===== Datetime Rules =====
const datetimeLoading = ref(false)
const datetimeRows = ref<any[]>([])
const datetimeTotal = ref(0)
const datetimePage = ref(1)
const datetimePageSize = ref(15)
const datetimeRuleType = ref('')

const datetimeDialog = ref(false)
const datetimeSaving = ref(false)
const editingDatetimeId = ref<number | null>(null)
const datetimeForm = reactive({
  rule_code: '', rule_name: '', rule_type: '', apply_scope: 'ALL',
  apply_value: '', config_value: '{}', status: 1, remark: ''
})
const configValueError = ref('')

const RULE_TYPES: Record<string, string> = {
  CUTOFF_TIME: '截单时间', LEAD_TIME: '提前期', NON_WORKDAY: '非工作日处理', DELIVERY_WINDOW: '配送窗口'
}

const fetchDatetimeRules = async () => {
  datetimeLoading.value = true
  try {
    const { data } = await axios.get('/rules/datetime', {
      params: { page: datetimePage.value, pageSize: datetimePageSize.value, ruleType: datetimeRuleType.value || undefined }
    })
    if (data.code === 200) {
      datetimeRows.value = data.data.list || []
      datetimeTotal.value = data.data.total || 0
    }
  } catch { ElMessage.error('获取日期时间规则失败') }
  finally { datetimeLoading.value = false }
}

const openDatetimeDialog = (row?: any) => {
  if (row) {
    editingDatetimeId.value = row.id
    Object.assign(datetimeForm, {
      rule_code: row.rule_code, rule_name: row.rule_name, rule_type: row.rule_type,
      apply_scope: row.apply_scope, apply_value: row.apply_value || '',
      config_value: typeof row.config_value === 'string' ? row.config_value : JSON.stringify(row.config_value, null, 2),
      status: row.status, remark: row.remark || ''
    })
  } else {
    editingDatetimeId.value = null
    Object.assign(datetimeForm, {
      rule_code: '', rule_name: '', rule_type: '', apply_scope: 'ALL',
      apply_value: '', config_value: '{}', status: 1, remark: ''
    })
  }
  configValueError.value = ''
  datetimeDialog.value = true
}

const saveDatetime = async () => {
  if (!datetimeForm.rule_code || !datetimeForm.rule_name) return ElMessage.warning('规则编码和名称必填')
  if (!datetimeForm.rule_type) return ElMessage.warning('请选择规则类型')
  // Validate config_value JSON
  let parsed: any
  try { parsed = JSON.parse(datetimeForm.config_value) } catch {
    configValueError.value = '配置值不是有效的 JSON'
    return
  }
  configValueError.value = ''
  datetimeSaving.value = true
  try {
    const payload = { ...datetimeForm, config_value: parsed }
    if (editingDatetimeId.value) {
      await axios.put(`/rules/datetime/${editingDatetimeId.value}`, payload)
    } else {
      await axios.post('/rules/datetime', payload)
    }
    ElMessage.success(editingDatetimeId.value ? '更新成功' : '新增成功')
    datetimeDialog.value = false
    fetchDatetimeRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '保存失败')
  } finally { datetimeSaving.value = false }
}

const deleteDatetime = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除规则 ${row.rule_name} 吗？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await axios.delete(`/rules/datetime/${row.id}`)
    ElMessage.success('删除成功')
    fetchDatetimeRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '删除失败')
  }
}

// Preset templates for datetime rules
const applyPreset = (type: string) => {
  const presets: Record<string, any> = {
    CUTOFF_TIME: { rule_type: 'CUTOFF_TIME', config_value: JSON.stringify({ time: '16:00', desc: '每日16:00前提交当日处理' }, null, 2) },
    LEAD_TIME: { rule_type: 'LEAD_TIME', config_value: JSON.stringify({ days: 1, desc: '省内提前1天' }, null, 2) },
    NON_WORKDAY: { rule_type: 'NON_WORKDAY', config_value: JSON.stringify({ skip: true, push_to_next: true, desc: '非工作日顺延至下一工作日' }, null, 2) },
    DELIVERY_WINDOW: { rule_type: 'DELIVERY_WINDOW', config_value: JSON.stringify({ start_hour: 8, end_hour: 18, desc: '配送时间窗口8:00-18:00' }, null, 2) }
  }
  const preset = presets[type]
  if (preset) Object.assign(datetimeForm, preset)
}

// ===== Slot Rules =====
const slotLoading = ref(false)
const slotRows = ref<any[]>([])
const slotTotal = ref(0)
const slotPage = ref(1)
const slotPageSize = ref(15)
const slotKeyword = ref('')
const slotStatus = ref('')

const slotDialog = ref(false)
const slotSaving = ref(false)
const editingSlotId = ref<number | null>(null)
const slotForm = reactive({ slot_code: '', slot_name: '', slot_type: 'PROMO', start_date: '', end_date: '', priority: 10, status: 1, remark: '' })
const SLOT_TYPES: Record<string, string> = { PROMO: '大促', FESTIVAL: '节日', SEASONAL: '季节性', REGULAR: '常规' }

// Allocation rules for a selected slot
const slotDetailDialog = ref(false)
const activeSlotCode = ref('')
const allocationRules = ref<any[]>([])
const allocDialog = ref(false)
const allocSaving = ref(false)
const editingAllocId = ref<number | null>(null)
const allocForm = reactive({ rule_name: '', channel_codes: [] as string[], sku_codes: [] as string[], warehouse_weights: [] as any[], status: 1, remark: '' })
const channelOptions = ref<any[]>([])
const skuOptions = ref<any[]>([])
const warehouseOptions = ref<any[]>([])

const fetchSlots = async () => {
  slotLoading.value = true
  try {
    const { data } = await axios.get('/rules/slots', { params: { page: slotPage.value, pageSize: slotPageSize.value, keyword: slotKeyword.value || undefined, status: slotStatus.value || undefined } })
    if (data.code === 200) { slotRows.value = data.data.list || []; slotTotal.value = data.data.total || 0 }
  } catch { ElMessage.error('获取档期列表失败') }
  finally { slotLoading.value = false }
}

const openSlotDialog = (row?: any) => {
  if (row) {
    editingSlotId.value = row.id
    Object.assign(slotForm, { slot_code: row.slot_code, slot_name: row.slot_name, slot_type: row.slot_type, start_date: row.start_date, end_date: row.end_date, priority: row.priority, status: row.status, remark: row.remark || '' })
  } else {
    editingSlotId.value = null
    Object.assign(slotForm, { slot_code: '', slot_name: '', slot_type: 'PROMO', start_date: '', end_date: '', priority: 10, status: 1, remark: '' })
  }
  slotDialog.value = true
}

const saveSlot = async () => {
  if (!slotForm.slot_code || !slotForm.slot_name) return ElMessage.warning('编码和名称必填')
  slotSaving.value = true
  try {
    if (editingSlotId.value) { await axios.put(`/rules/slots/${editingSlotId.value}`, slotForm) }
    else { await axios.post('/rules/slots', slotForm) }
    ElMessage.success(editingSlotId.value ? '更新成功' : '新增成功')
    slotDialog.value = false; fetchSlots()
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '保存失败') }
  finally { slotSaving.value = false }
}

const deleteSlot = async (row: any) => {
  try { await ElMessageBox.confirm(`确定删除档期 ${row.slot_name} 吗？`, '删除确认', { type: 'warning' }) } catch { return }
  try { await axios.delete(`/rules/slots/${row.id}`); ElMessage.success('删除成功'); fetchSlots() }
  catch (e: any) { ElMessage.error(e?.response?.data?.msg || '删除失败') }
}

const openAllocationRules = async (slotCode: string) => {
  activeSlotCode.value = slotCode
  try {
    const { data } = await axios.get('/rules/slot-allocations', { params: { slot_code: slotCode } })
    allocationRules.value = data?.data || []
  } catch { allocationRules.value = [] }
  slotDetailDialog.value = true
}

const openAllocDialog = (row?: any) => {
  if (row) {
    editingAllocId.value = row.id
    Object.assign(allocForm, {
      rule_name: row.rule_name, channel_codes: row.channel_codes || [], sku_codes: row.sku_codes || [],
      warehouse_weights: row.warehouse_weights || [], status: row.status, remark: row.remark || ''
    })
  } else {
    editingAllocId.value = null
    Object.assign(allocForm, { rule_name: '', channel_codes: [], sku_codes: [], warehouse_weights: [], status: 1, remark: '' })
  }
  // Fetch options for dropdowns
  fetchAllocOptions()
  allocDialog.value = true
}

const fetchAllocOptions = async () => {
  try {
    const [planRes, whRes] = await Promise.all([
      axios.get('/demand/channel-plan/options'),
      axios.get('/inventory-ops/options')
    ])
    channelOptions.value = planRes.data?.data?.channels || []
    skuOptions.value = planRes.data?.data?.skus || []
    warehouseOptions.value = whRes.data?.data?.warehouses || []
  } catch { /* silent */ }
}

const addWeight = () => allocForm.warehouse_weights.push({ warehouse_code: '', warehouse_name: '', weight: 0 })
const removeWeight = (idx: number) => allocForm.warehouse_weights.splice(idx, 1)

const saveAlloc = async () => {
  if (!allocForm.rule_name) return ElMessage.warning('规则名称必填')
  allocSaving.value = true
  try {
    const payload = { ...allocForm, slot_code: activeSlotCode.value }
    if (editingAllocId.value) { await axios.put(`/rules/slot-allocations/${editingAllocId.value}`, payload) }
    else { await axios.post('/rules/slot-allocations', payload) }
    ElMessage.success(editingAllocId.value ? '更新成功' : '新增成功')
    allocDialog.value = false; openAllocationRules(activeSlotCode.value)
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '保存失败') }
  finally { allocSaving.value = false }
}

const deleteAlloc = async (row: any) => {
  try { await ElMessageBox.confirm('确定删除该分配规则吗？', '删除确认', { type: 'warning' }) } catch { return }
  try { await axios.delete(`/rules/slot-allocations/${row.id}`); ElMessage.success('删除成功'); openAllocationRules(activeSlotCode.value) }
  catch (e: any) { ElMessage.error(e?.response?.data?.msg || '删除失败') }
}

onMounted(async () => {
  await fetchFreshnessRules()
  try {
    const { data } = await axios.get('/demand/channel-plan/options')
    freshnessPreviewSkus.value = data?.data?.skus || []
    freshnessPreviewSku.value = freshnessPreviewSkus.value[0]?.sku_code || ''
    if (freshnessPreviewSku.value) await loadFreshnessPreview()
  } catch {
    freshnessPreviewSkus.value = []
  }
})
</script>

<template>
  <div class="rule-config-center">
    <div class="page-header">
      <h3>规则配置中心</h3>
    </div>

    <el-tabs v-model="activeTab" @tab-change="activeTab === 'freshness' ? fetchFreshnessRules() : activeTab === 'datetime' ? fetchDatetimeRules() : fetchSlots()">
      <!-- ====== Freshness Rules Tab ====== -->
      <el-tab-pane label="新鲜度规则" name="freshness">
        <div class="toolbar">
          <el-input v-model="freshnessKeyword" placeholder="搜索编码/名称" clearable style="width: 220px" @keydown.enter="fetchFreshnessRules" @clear="fetchFreshnessRules" />
          <el-button type="primary" @click="fetchFreshnessRules">查询</el-button>
          <el-button type="success" @click="openFreshnessDialog()">新增规则</el-button>
        </div>

        <el-table :data="freshnessRows" v-loading="freshnessLoading" stripe border style="width:100%">
          <el-table-column prop="priority" label="优先级" width="70" align="center" />
          <el-table-column prop="rule_code" label="编码" width="160" />
          <el-table-column prop="rule_name" label="名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="温层" width="90" align="center">
            <template #default="{ row }">{{ TEMPERATURE_ZONES[row.temperature_zone] || '全部' }}</template>
          </el-table-column>
          <el-table-column label="效期区间(天)" width="160" align="center">
            <template #default="{ row }">{{ row.min_remaining_days }} ~ {{ row.max_remaining_days === 9999 ? '不限' : row.max_remaining_days }}</template>
          </el-table-column>
          <el-table-column label="允许范围" width="90" align="center">
            <template #default="{ row }">{{ ALLOWED_SCOPES[row.allowed_scope] || '全国' }}</template>
          </el-table-column>
          <el-table-column label="强制FEFO" width="90" align="center">
            <template #default="{ row }">{{ row.force_fefo ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column label="到货比例" width="90" align="center">
            <template #default="{ row }">{{ (row.allocation_ratio ?? row.min_delivery_ratio) ? (((row.allocation_ratio ?? row.min_delivery_ratio) * 100).toFixed(0) + '%') : '--' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openFreshnessDialog(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="deleteFreshness(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager"><el-pagination background layout="total, prev, pager, next" :total="freshnessTotal" :page-size="freshnessPageSize" v-model:current-page="freshnessPage" @current-change="fetchFreshnessRules" /></div>
      </el-tab-pane>

      <!-- ====== Datetime Rules Tab ====== -->
      <el-tab-pane label="日期时间规则" name="datetime">
        <div class="toolbar">
          <el-select v-model="datetimeRuleType" placeholder="规则类型" clearable style="width:150px" @change="datetimePage=1;fetchDatetimeRules()">
            <el-option v-for="(label, key) in RULE_TYPES" :key="key" :label="label" :value="key" />
          </el-select>
          <el-button type="primary" @click="fetchDatetimeRules">查询</el-button>
          <el-button type="success" @click="openDatetimeDialog()">新增规则</el-button>
        </div>

        <el-table :data="datetimeRows" v-loading="datetimeLoading" stripe border style="width:100%">
          <el-table-column prop="rule_code" label="编码" width="160" />
          <el-table-column prop="rule_name" label="名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="类型" width="120" align="center">
            <template #default="{ row }">{{ RULE_TYPES[row.rule_type] || row.rule_type }}</template>
          </el-table-column>
          <el-table-column prop="apply_scope" label="适用范围" width="140" align="center" />
          <el-table-column label="配置值" min-width="200">
            <template #default="{ row }">
              <code style="font-size:12px;word-break:break-all">{{ typeof row.config_value === 'object' ? JSON.stringify(row.config_value) : row.config_value }}</code>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openDatetimeDialog(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="deleteDatetime(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager"><el-pagination background layout="total, prev, pager, next" :total="datetimeTotal" :page-size="datetimePageSize" v-model:current-page="datetimePage" @current-change="fetchDatetimeRules" /></div>
      </el-tab-pane>

      <!-- ====== Slot Rules Tab ====== -->
      <el-tab-pane label="档期规则" name="slot">
        <div class="toolbar">
          <el-input v-model="slotKeyword" placeholder="搜索编码/名称" clearable style="width:200px" @keydown.enter="slotPage=1;fetchSlots()" @clear="fetchSlots" />
          <el-select v-model="slotStatus" placeholder="状态" clearable style="width:120px" @change="slotPage=1;fetchSlots()">
            <el-option label="启用" :value="1" /><el-option label="禁用" :value="0" />
          </el-select>
          <el-button type="primary" @click="slotPage=1;fetchSlots()">查询</el-button>
          <el-button type="success" @click="openSlotDialog()">新增档期</el-button>
        </div>

        <el-table :data="slotRows" v-loading="slotLoading" stripe border style="width:100%">
          <el-table-column prop="slot_code" label="编码" width="150" />
          <el-table-column prop="slot_name" label="名称" min-width="150" show-overflow-tooltip />
          <el-table-column label="类型" width="90" align="center">
            <template #default="{ row }">{{ SLOT_TYPES[row.slot_type] || row.slot_type }}</template>
          </el-table-column>
          <el-table-column label="时间范围" width="210">
            <template #default="{ row }">{{ row.start_date }} ~ {{ row.end_date }}</template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="70" align="center" />
          <el-table-column prop="rule_count" label="规则数" width="70" align="center" />
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }"><el-tag :type="row.status===1?'success':'info'" size="small">{{ row.status===1?'启用':'禁用' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button link type="warning" size="small" @click="openAllocationRules(row.slot_code)">分配规则</el-button>
              <el-button link type="primary" size="small" @click="openSlotDialog(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="deleteSlot(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager"><el-pagination background layout="total, prev, pager, next" :total="slotTotal" :page-size="slotPageSize" v-model:current-page="slotPage" @current-change="fetchSlots" /></div>

        <!-- Slot Detail Dialog (allocation rules) -->
        <el-dialog v-model="slotDetailDialog" title="档期分配规则" width="800px">
          <div class="toolbar">
            <el-button type="success" size="small" @click="openAllocDialog()">新增分配规则</el-button>
          </div>
          <el-table :data="allocationRules" stripe border size="small">
            <el-table-column prop="rule_name" label="规则名称" width="140" />
            <el-table-column label="渠道范围" min-width="150">
              <template #default="{ row }">{{ row.channel_codes?.length ? row.channel_codes.join(', ') : '全部' }}</template>
            </el-table-column>
            <el-table-column label="SKU范围" min-width="150">
              <template #default="{ row }">{{ row.sku_codes?.length ? row.sku_codes.join(', ') : '全部' }}</template>
            </el-table-column>
            <el-table-column label="仓库权重" min-width="200">
              <template #default="{ row }">{{ row.warehouse_weights?.map((w:any) => `${w.warehouse_name||w.warehouse_code}:${w.weight}%`).join(' | ') || '--' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openAllocDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="deleteAlloc(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-dialog>

        <!-- Allocation Rule Dialog -->
        <el-dialog v-model="allocDialog" :title="editingAllocId ? '编辑分配规则' : '新增分配规则'" width="650px">
          <el-form label-width="100px">
            <el-form-item label="规则名称" required><el-input v-model="allocForm.rule_name" placeholder="如 618华东常温分配" /></el-form-item>
            <el-form-item label="适用渠道"><el-select v-model="allocForm.channel_codes" multiple filterable placeholder="留空=全部渠道" style="width:100%"><el-option v-for="ch in channelOptions" :key="ch.channel_code" :label="ch.channel_name" :value="ch.channel_code" /></el-select></el-form-item>
            <el-form-item label="适用SKU"><el-select v-model="allocForm.sku_codes" multiple filterable placeholder="留空=全部SKU" style="width:100%"><el-option v-for="sk in skuOptions" :key="sk.sku_code" :label="`${sk.sku_code} ${sk.sku_name}`" :value="sk.sku_code" /></el-select></el-form-item>
            <el-form-item label="仓库权重分配">
              <div style="width:100%">
                <div v-for="(w, idx) in allocForm.warehouse_weights" :key="idx" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                  <el-select v-model="w.warehouse_code" placeholder="仓库" style="width:200px" @change="(val:string) => { const wh = warehouseOptions.find((o:any) => o.warehouse_code === val); if (wh) w.warehouse_name = wh.warehouse_name }"><el-option v-for="wh in warehouseOptions" :key="wh.warehouse_code" :label="wh.warehouse_name" :value="wh.warehouse_code" /></el-select>
                  <el-input-number v-model="w.weight" :min="0" :max="100" placeholder="权重%" style="width:120px" controls-position="right" /> <span>%</span>
                  <el-button link type="danger" size="small" @click="removeWeight(idx)">删除</el-button>
                </div>
                <el-button link type="primary" size="small" @click="addWeight">+ 添加仓库</el-button>
              </div>
            </el-form-item>
            <el-form-item label="状态"><el-switch v-model="allocForm.status" :active-value="1" :inactive-value="0" /></el-form-item>
          </el-form>
          <template #footer><el-button @click="allocDialog=false">取消</el-button><el-button type="primary" :loading="allocSaving" @click="saveAlloc">保存</el-button></template>
        </el-dialog>
      </el-tab-pane>
    </el-tabs>

    <!-- Freshness Dialog -->
    <el-dialog v-model="freshnessDialog" width="1120px" :close-on-click-modal="false" class="rule-editor-dialog">
      <template #header>
        <div class="dialog-topbar">
          <div class="dialog-title-wrap">
            <span class="dialog-close" @click="freshnessDialog = false">?</span>
            <div>
              <div class="dialog-title">{{ editingFreshnessId ? '编辑规则' : '新增规则' }}</div>
              <div class="dialog-subtitle">用于效期分档、占比拆分与冷链、日分仓联动</div>
            </div>
          </div>
        </div>
      </template>

      <div class="rule-editor-layout">
        <div class="rule-editor-main">
          <el-form label-position="top" class="rule-editor-form">
            <el-form-item label="规则名称" required>
              <el-input v-model="freshnessForm.rule_name" maxlength="100" show-word-limit :placeholder="'规则名称??????????'" />
            </el-form-item>

            <div class="rule-inline-grid">
              <el-form-item label="规则编码" required>
                <el-input v-model="freshnessForm.rule_code" placeholder="? COLD_CHAIN_NORMAL" :disabled="!!editingFreshnessId" />
              </el-form-item>
              <el-form-item label="优先级">
                <el-input-number v-model="freshnessForm.priority" :min="0" :max="999" controls-position="right" style="width:100%" />
              </el-form-item>
            </div>

            <div class="rule-inline-grid">
              <el-form-item label="适用温层">
                <el-select v-model="freshnessForm.temperature_zone" style="width:100%">
                  <el-option v-for="(label, key) in TEMPERATURE_ZONES" :key="key" :label="label" :value="Number(key)" />
                </el-select>
              </el-form-item>
              <el-form-item label="调拨范围">
                <el-select v-model="freshnessForm.allowed_scope" style="width:100%">
                  <el-option v-for="(label, key) in ALLOWED_SCOPES" :key="key" :label="label" :value="Number(key)" />
                </el-select>
              </el-form-item>
            </div>

            <div class="rule-inline-grid">
              <el-form-item label="剩余效期下限(天)">
                <el-input-number v-model="freshnessForm.min_remaining_days" :min="0" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item label="剩余效期上限(天)">
                <el-input-number v-model="freshnessForm.max_remaining_days" :min="0" controls-position="right" style="width:100%" />
              </el-form-item>
            </div>

            <div class="rule-inline-grid">
              <el-form-item label="效期占比">
                <el-input-number v-model="freshnessForm.allocation_ratio" :min="0" :max="1" :precision="2" :step="0.05" controls-position="right" style="width:100%" />
              </el-form-item>
              <el-form-item label="到货最低比例">
                <el-input-number v-model="freshnessForm.min_delivery_ratio" :min="0" :max="1" :precision="2" :step="0.05" controls-position="right" style="width:100%" />
              </el-form-item>
            </div>

            <div class="rule-inline-grid">
              <el-form-item label="强制 FEFO">
                <el-switch v-model="freshnessForm.force_fefo" />
              </el-form-item>
              <el-form-item label="启用状态">
                <el-switch v-model="freshnessForm.status" :active-value="1" :inactive-value="0" />
              </el-form-item>
            </div>

            <el-form-item label="备注">
              <el-input v-model="freshnessForm.remark" type="textarea" :rows="3" :placeholder="'备注???????????'" />
            </el-form-item>
          </el-form>
        </div>

        <aside class="rule-editor-side">
          <div class="side-block">
            <div class="side-block-title">效期分档预览</div>
            <div class="toolbar" style="margin-bottom: 12px">
              <el-select v-model="freshnessPreviewSku" filterable :placeholder="'选择SKU'" style="width: 100%">
                <el-option
                  v-for="sku in freshnessPreviewSkus"
                  :key="sku.sku_code"
                  :label="sku.sku_code + ' / ' + sku.sku_name"
                  :value="sku.sku_code"
                />
              </el-select>
            </div>
            <div class="toolbar" style="margin-bottom: 12px">
              <el-input-number v-model="freshnessPreviewQty" :min="1" :max="999999" style="width: 180px" />
              <el-button type="primary" @click="loadFreshnessPreview">预览拆分</el-button>
            </div>
            <el-table :data="freshnessPreviewRows" border size="small" v-loading="freshnessPreviewLoading" height="260">
              <el-table-column prop="rule_name" :label="'档位'" min-width="120" />
              <el-table-column prop="remaining_range" :label="'效期范围'" width="150" />
              <el-table-column prop="allocation_percent" :label="'效期占比'" width="90" align="right" />
              <el-table-column prop="allocation_qty" :label="'数量'" width="90" align="right" />
            </el-table>
          </div>

          <div class="side-block" style="margin-top: 16px">
            <div class="side-block-title">适用范围</div>
            <el-radio-group v-model="freshnessScopeMode" style="margin-bottom: 12px">
              <el-radio-button label="CATEGORY">品类</el-radio-button>
              <el-radio-button label="PRODUCT">产品</el-radio-button>
            </el-radio-group>
            <el-tree
              :data="freshnessScopeTree"
              show-checkbox
              node-key="id"
              :default-expand-all="true"
              :check-strictly="false"
              :props="{ label: 'label', children: 'children' }"
            />
          </div>
        </aside>
      </div>

      <template #footer>
        <el-button @click="freshnessDialog=false">取消</el-button>
        <el-button type="primary" :loading="freshnessSaving" @click="saveFreshness">保存</el-button>
      </template>
    </el-dialog>

    <!-- Datetime Dialog -->
    <el-dialog v-model="datetimeDialog" :title="editingDatetimeId ? '编辑日期时间规则' : '新增日期时间规则'" width="620px" :close-on-click-modal="false">
      <el-form label-width="110px" label-position="right">
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="规则编码" required><el-input v-model="datetimeForm.rule_code" placeholder="如 CUTOFF_16" :disabled="!!editingDatetimeId" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="规则名称" required><el-input v-model="datetimeForm.rule_name" placeholder="如 每日16点截单" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="规则类型" required>
              <el-select v-model="datetimeForm.rule_type" style="width:100%" @change="applyPreset(datetimeForm.rule_type)">
                <el-option v-for="(label, key) in RULE_TYPES" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="适用范围"><el-select v-model="datetimeForm.apply_scope" style="width:100%"><el-option label="全部" value="ALL" /><el-option label="省内" value="INTRA_PROVINCE" /><el-option label="跨省" value="INTER_PROVINCE" /><el-option label="常温" value="AMBIENT" /><el-option label="冷藏" value="COLD" /></el-select></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="配置值 (JSON)" required :error="configValueError">
          <el-input v-model="datetimeForm.config_value" type="textarea" :rows="6" placeholder='{"key": "value"}' />
          <div style="font-size:11px;color:#909399;margin-top:2px">必须是有效 JSON 格式</div>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="状态"><el-switch v-model="datetimeForm.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="datetimeForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="datetimeDialog=false">取消</el-button><el-button type="primary" :loading="datetimeSaving" @click="saveDatetime">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.rule-config-center { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-header h3 { margin: 0; font-size: 18px; font-weight: 600; }
.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.hint { font-size: 11px; color: #909399; margin-left: 6px; }

.rule-editor-dialog :deep(.el-dialog__header) {
  padding: 0;
  margin-right: 0;
}

.dialog-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-bottom: 1px solid #eef2f7;
  padding: 20px 24px;
}

.dialog-title-wrap {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.dialog-close {
  font-size: 36px;
  line-height: 1;
  color: #9ca3af;
  cursor: pointer;
  margin-top: -6px;
}

.dialog-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.dialog-subtitle {
  margin-top: 6px;
  color: #6b7280;
  font-size: 13px;
}

.rule-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
  gap: 24px;
  padding: 12px 4px 0;
}

.rule-editor-main {
  min-width: 0;
}

.rule-editor-form {
  padding-right: 8px;
}

.rule-inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.rule-editor-side {
  min-width: 0;
  border-left: 1px solid #eef2f7;
  padding-left: 20px;
}

.side-block-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 12px;
}

.side-block {
  background: #fff;
}

@media (max-width: 1100px) {
  .rule-editor-layout {
    grid-template-columns: 1fr;
  }

  .rule-editor-side {
    border-left: 0;
    padding-left: 0;
    border-top: 1px solid #eef2f7;
    padding-top: 20px;
  }
}
</style>
