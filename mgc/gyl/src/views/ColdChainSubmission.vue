<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const router = useRouter()
const appStore = useAppStore()

const STATUS_MAP: Record<number, { label: string; type: string }> = {
  0: { label: '草稿', type: 'info' }, 1: { label: '已分配', type: 'warning' },
  2: { label: '已确认', type: 'primary' }, 3: { label: '已下发', type: 'success' }, [-1]: { label: '已删除', type: 'danger' }
}
const base = '/demand/cold-chain-submission'

// List state
const loading = ref(false), rows = ref<any[]>([]), total = ref(0), page = ref(1), pageSize = ref(10)
const query = reactive({ keyword: '', status: '' })
const fetchList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get(base, { params: { page: page.value, pageSize: pageSize.value, keyword: query.keyword || undefined, status: query.status || undefined } })
    if (data.code === 200) { rows.value = data.data.list || []; total.value = data.data.total || 0 }
  } catch { ElMessage.error('获取列表失败') } finally { loading.value = false }
}

// Create
const createDlg = ref(false), createSaving = ref(false)
const versions = ref<any[]>([])
const createForm = reactive({ version_code: '', ratios: [70, 30] as number[] })
const openCreate = async () => {
  try { const { data } = await axios.get(`${base}/confirmed-versions`); if (data.code === 200) versions.value = data.data || [] } catch { ElMessage.error('获取版本失败'); return }
  createForm.version_code = ''; createForm.ratios = [70, 30]; createDlg.value = true
}
const handleCreate = async () => {
  if (!createForm.version_code) return ElMessage.warning('请选择版本')
  createSaving.value = true
  try {
    const { data } = await axios.post(base, { version_code: createForm.version_code, ratios: createForm.ratios.map(r => r / 100) })
    if (data.code === 200) {
      const r = data.data.allocResult
      ElMessage.success(`创建成功：足额${r.allocated}行，缺额${r.shortfall}行，无库存${r.noStock}行`)
      createDlg.value = false; fetchList()
    }
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '创建失败') } finally { createSaving.value = false }
}

// Detail Drawer
const drawer = ref(false), detailLoading = ref(false)
const activeSub = ref<any>(null), lineRows = ref<any[]>([]), lineTotal = ref(0), linePage = ref(1), linePageSize = ref(20)
const stockWarnings = ref<any[]>([])
const warehouseCols = computed(() => lineRows.value[0]?.warehouses || [])
const canEdit = computed(() => activeSub.value && (activeSub.value.status === 0 || activeSub.value.status === 1))
const openDetail = async (sub: any) => {
  drawer.value = true; detailLoading.value = true; linePage.value = 1
  try {
    const { data } = await axios.get(`${base}/${sub.submission_no}`)
    if (data.code === 200) activeSub.value = data.data
    await fetchLines()
  } catch { ElMessage.error('获取详情失败'); drawer.value = false }
  finally { detailLoading.value = false }
}
const fetchLines = async () => {
  if (!activeSub.value) return
  try {
    const { data } = await axios.get(`${base}/${activeSub.value.submission_no}/lines`, { params: { page: linePage.value, pageSize: linePageSize.value } })
    if (data.code === 200) { lineRows.value = data.data.list || []; lineTotal.value = data.data.total || 0 }
    checkWarnings()
  } catch { ElMessage.error('获取行失败') }
}
const checkWarnings = () => {
  const w: any[] = []
  lineRows.value.forEach(l => {
    (l.warehouses || []).forEach((wh: any) => {
      if (wh.allocation_qty > wh.available_qty) w.push({ sku: l.sku_name, wh: wh.warehouse_name, msg: `${l.sku_name}→${wh.warehouse_name}: 分配${wh.allocation_qty}>可用${wh.available_qty}` })
    })
  })
  stockWarnings.value = w
}

// Auto allocate
const autoAlloc = async () => {
  try { await ElMessageBox.confirm('将重新自动分配所有行', '确认', { type: 'warning' }) } catch { return }
  try {
    const { data } = await axios.post(`${base}/${activeSub.value.submission_no}/auto-allocate`)
    if (data.code === 200) { ElMessage.success(`足额${data.data.allocated}/缺额${data.data.shortfall}/无库存${data.data.noStock}`); await fetchLines() }
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '失败') }
}

// Toggle emergency
const toggleEmergency = async (line: any) => {
  try { await axios.post(`${base}/${activeSub.value.submission_no}/toggle-emergency`, { line_id: line.id, is_emergency: !line.is_emergency }); line.is_emergency = !line.is_emergency; ElMessage.success(line.is_emergency ? '已标记紧急' : '已取消紧急') }
  catch { ElMessage.error('操作失败') }
}

// Confirm / Dispatch / Export / Delete
const doConfirm = async () => {
  try { await ElMessageBox.confirm('确认后生成发货指引', '确认', { type: 'warning' }) } catch { return }
  try { const { data } = await axios.post(`${base}/${activeSub.value.submission_no}/confirm`); ElMessage.success(data.msg); const d = await axios.get(`${base}/${activeSub.value.submission_no}`); if (d.data.code === 200) activeSub.value = d.data.data; fetchList() } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '失败') }
}
const doDispatch = async () => {
  try { await ElMessageBox.confirm('下发后生成调拨单并锁定库存', '下发', { type: 'warning' }) } catch { return }
  try { const { data } = await axios.post(`${base}/${activeSub.value.submission_no}/dispatch`); ElMessage.success(`调拨单${data.data.transferCount}个，锁定${data.data.lockCount}条`); const d = await axios.get(`${base}/${activeSub.value.submission_no}`); if (d.data.code === 200) activeSub.value = d.data.data; fetchList() } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '失败') }
}
const doExport = async () => {
  try { const resp = await axios.get(`${base}/${activeSub.value.submission_no}/export`, { responseType: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(resp.data); const m = (resp.headers['content-disposition'] || '').match(/filename\*=UTF-8''(.+)/); a.download = m ? decodeURIComponent(m[1]) : '低温提报.xlsx'; a.click() } catch { ElMessage.error('导出失败') }
}
const doDelete = async (sub: any) => {
  try { await ElMessageBox.confirm('确定删除？', '确认', { type: 'warning' }) } catch { return }
  try { await axios.delete(`${base}/${sub.submission_no}`); ElMessage.success('已删除'); fetchList() } catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>

<template>
  <div class="cold-submission">
    <div class="page-hd"><h3>🧊 低温需求提报</h3><el-button type="primary" @click="openCreate">新建低温提报单</el-button></div>

    <el-card shadow="never">
      <div class="bar">
        <el-input v-model="query.keyword" placeholder="搜索编号/计划" clearable style="width:240px" @keydown.enter="page=1;fetchList()" @clear="page=1;fetchList()" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width:130px" @change="page=1;fetchList()"><el-option label="草稿" :value="0" /><el-option label="已分配" :value="1" /><el-option label="已确认" :value="2" /><el-option label="已下发" :value="3" /></el-select>
        <el-button type="primary" @click="page=1;fetchList()">查询</el-button>
      </div>
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="submission_no" label="提报编号" width="200" />
        <el-table-column label="关联计划" min-width="150" show-overflow-tooltip>
          <template #default="{row}"><el-button link type="primary" size="small" @click="router.push('/demand/channel-plan')">{{row.plan_name}}</el-button></template>
        </el-table-column>
        <el-table-column prop="version_label" label="版本" width="140" />
        <el-table-column label="分配进度" width="110" align="center"><template #default="{row}">{{row.fulfilled_count}}/{{row.line_count}}</template></el-table-column>
        <el-table-column label="状态" width="90" align="center"><template #default="{row}"><el-tag :type="STATUS_MAP[row.status]?.type" size="small">{{STATUS_MAP[row.status]?.label}}</el-tag></template></el-table-column>
        <el-table-column prop="created_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{row}"><el-button link type="primary" size="small" @click="openDetail(row)">查看</el-button><el-button link type="danger" size="small" :disabled="row.status===3" @click="doDelete(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
      <div class="pager"><el-pagination background layout="total,prev,pager,next" :total="total" :page-size="pageSize" v-model:current-page="page" @current-change="fetchList" /></div>
    </el-card>

    <!-- Create Dialog -->
    <el-dialog v-model="createDlg" title="新建低温需求提报单" width="520px">
      <el-form label-width="100px">
        <el-form-item label="需求计划版本" required><el-select v-model="createForm.version_code" placeholder="选择已确认版本" style="width:100%"><el-option v-for="v in versions" :key="v.version_code" :label="`${v.plan_name} - ${v.version_label}`" :value="v.version_code" /></el-select></el-form-item>
        <el-alert title="系统将自动筛选该版本中的低温（冷藏）产品，仅匹配冷链仓库" type="info" show-icon :closable="false" style="margin-bottom:12px" />
        <el-form-item label="分配比例"><el-input-number v-model="createForm.ratios[0]" :min="0" :max="100" style="width:120px" controls-position="right" /> % <span style="margin:0 8px">:</span> <el-input-number v-model="createForm.ratios[1]" :min="0" :max="100" style="width:120px" controls-position="right" /> %</el-form-item>
      </el-form>
      <template #footer><el-button @click="createDlg=false">取消</el-button><el-button type="primary" :loading="createSaving" @click="handleCreate">创建并自动分配</el-button></template>
    </el-dialog>

    <!-- Detail Drawer -->
    <el-drawer v-model="drawer" title="低温提报详情" size="90%">
      <template v-if="activeSub">
        <div class="sub-hd">
          <span><b>{{activeSub.submission_no}}</b></span>
          <span>{{activeSub.plan_name}} / {{activeSub.version_label}}</span>
          <el-tag :type="STATUS_MAP[activeSub.status]?.type" size="small">{{STATUS_MAP[activeSub.status]?.label}}</el-tag>
          <span>进度 {{activeSub.fulfilled_count}}/{{activeSub.line_count}}</span>
          <span style="color:#e6a23c">🧊 仅低温产品</span>
        </div>
        <el-alert v-if="stockWarnings.length" title="库存预警" type="warning" show-icon :closable="false" style="margin-bottom:8px"><div v-for="(w,i) in stockWarnings.slice(0,3)" :key="i" style="font-size:12px">{{w.msg}}</div></el-alert>

        <el-table :data="lineRows" v-loading="detailLoading" stripe border size="small" max-height="calc(100vh - 280px)">
          <el-table-column prop="lv2_channel_name" label="渠道" width="110" fixed="left" />
          <el-table-column label="SKU" width="180" fixed="left"><template #default="{row}"><div>{{row.sku_code}}</div><div style="font-size:11px;color:#909399">{{row.sku_name}}</div></template></el-table-column>
          <el-table-column prop="plan_week" label="周" width="85" align="center" />
          <el-table-column label="需求量" width="85" align="right"><template #default="{row}"><b>{{row.plan_value}}</b></template></el-table-column>
          <el-table-column v-for="(wh, wi) in warehouseCols" :key="'wh'+wi" min-width="170">
            <template #header><div style="text-align:center"><div>{{wh.warehouse_name}}</div><div style="font-size:10px;color:#909399">{{wh.warehouse_code}} · {{wh.transport_hours}}h</div></div></template>
            <template #default="{row}">
              <div style="text-align:center">
                <template v-if="row.warehouses && row.warehouses[wi]">
                  <div :style="{color: row.warehouses[wi].allocation_qty > row.warehouses[wi].available_qty ? '#f56c6c' : '#303133', fontWeight:'bold'}">{{row.warehouses[wi].allocation_qty}}</div>
                  <div style="font-size:11px;color:#909399">可用: {{row.warehouses[wi].available_qty}}</div>
                  <div style="font-size:10px;color:#67c23a" v-if="row.warehouses[wi].transport_hours">{{row.warehouses[wi].transport_hours}}h</div>
                </template>
                <template v-else><span style="color:#c0c4cc">—</span></template>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="已分配" width="80" align="right"><template #default="{row}"><b>{{row.total_allocated}}</b></template></el-table-column>
          <el-table-column label="缺口" width="70" align="right"><template #default="{row}"><span :style="{color: row.shortage>0?'#f56c6c':'#67c23a'}">{{row.shortage||'—'}}</span></template></el-table-column>
          <el-table-column label="紧急" width="70" align="center">
            <template #default="{row}">
              <el-button link :type="row.is_emergency?'danger':'info'" size="small" @click="toggleEmergency(row)" :disabled="!canEdit">{{row.is_emergency?'🔴紧急':'标记'}}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager"><el-pagination background layout="total,prev,pager,next" :total="lineTotal" :page-size="linePageSize" v-model:current-page="linePage" @current-change="fetchLines" /></div>
      </template>
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <el-button @click="autoAlloc" :disabled="!canEdit">一键分配</el-button>
          <el-button @click="doExport">导出</el-button>
          <el-button type="primary" :disabled="!(activeSub?.status===0||activeSub?.status===1)" @click="doConfirm">确认</el-button>
          <el-button type="success" :disabled="activeSub?.status!==2" @click="doDispatch">下发</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.cold-submission{padding:20px}
.page-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.page-hd h3{margin:0;font-size:18px}
.bar{display:flex;gap:10px;margin-bottom:12px}
.pager{display:flex;justify-content:flex-end;margin-top:12px}
.sub-hd{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:#f5f7fa;border-radius:6px;margin-bottom:12px;font-size:14px}
</style>
