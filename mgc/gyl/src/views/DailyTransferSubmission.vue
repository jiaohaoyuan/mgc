<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const router = useRouter()
const appStore = useAppStore()
const base = '/daily-transfer'

const STATUS_MAP: Record<number, any> = { 0: { label: '草稿', type: 'info' }, 1: { label: '已确认', type: 'primary' }, 2: { label: '已下发', type: 'success' } }

// List
const loading = ref(false), rows = ref<any[]>([]), total = ref(0), page = ref(1), pageSize = ref(10)
const query = reactive({ keyword: '', status: '' })

const fetchList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get(base, { params: { page: page.value, pageSize: pageSize.value, keyword: query.keyword || undefined, status: query.status || undefined } })
    if (data.code === 200) { rows.value = data.data.list || []; total.value = data.data.total || 0 }
  } catch { ElMessage.error('获取失败') } finally { loading.value = false }
}

// Create
const createDlg = ref(false), createSaving = ref(false)
const sources = ref<any[]>([])
const createForm = reactive({ source_type: 'DEMAND_SUBMISSION', source_submission_no: '' })
const openCreate = async () => {
  try { const { data } = await axios.get(`${base}/sources`); if (data.code === 200) sources.value = data.data || []; else ElMessage.warning('暂无可拆解的已确认提报单') } catch { ElMessage.error('获取失败'); return }
  createForm.source_type = 'DEMAND_SUBMISSION'; createForm.source_submission_no = ''; createDlg.value = true
}
const handleCreate = async () => {
  if (!createForm.source_submission_no) return ElMessage.warning('请选择来源提报单')
  createSaving.value = true
  try {
    const { data } = await axios.post(base, createForm)
    if (data.code === 200) { ElMessage.success(`创建成功: ${data.data.line_count} 条日计划`); createDlg.value = false; fetchList() }
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '创建失败') } finally { createSaving.value = false }
}

// Detail
const drawer = ref(false), detail = ref<any>(null), dates = ref<string[]>([]), currentDate = ref('')
const dateLines = ref<any[]>([]), detailLoading = ref(false)

const openDetail = async (row: any) => {
  drawer.value = true; detailLoading.value = true; dates.value = []; currentDate.value = ''; dateLines.value = []
  try {
    const { data } = await axios.get(`${base}/${row.daily_no}`)
    if (data.code === 200) {
      detail.value = data.data
      dates.value = data.data.dates || []
      if (dates.value.length) { currentDate.value = String(dates.value[0]); await fetchDateLines() }
    }
  } catch { ElMessage.error('获取失败'); drawer.value = false }
  finally { detailLoading.value = false }
}

const fetchDateLines = async () => {
  if (!detail.value || !currentDate.value) return
  try {
    const { data } = await axios.get(`${base}/${detail.value.submission.daily_no}/date/${currentDate.value}`)
    if (data.code === 200) dateLines.value = data.data.lines || []
  } catch { dateLines.value = [] }
}

const changeDate = (d: string) => { currentDate.value = d; fetchDateLines() }

// Edit qty inline
const editingLine = ref<any>(null), editVal = ref('')
const startEdit = (line: any) => { editingLine.value = line; editVal.value = String(line.adjusted_qty) }
const finishEdit = async () => {
  if (!editingLine.value) return
  const val = Number(editVal.value)
  if (isNaN(val) || val < 0) return ElMessage.warning('请输入有效数字')
  try {
    await axios.put(`${base}/${detail.value.submission.daily_no}/lines/${editingLine.value.id}`, { adjusted_qty: val })
    editingLine.value.adjusted_qty = val; editingLine.value.is_adjusted = val !== editingLine.value.allocated_qty
    editingLine.value = null; ElMessage.success('已更新')
    fetchDateLines()
  } catch (e: any) { ElMessage.error(e?.response?.data?.msg || '失败') }
}

// Actions
const doConfirm = async () => {
  try { await ElMessageBox.confirm('确认日调拨计划？', '确认', { type: 'warning' }) } catch { return }
  try { await axios.post(`${base}/${detail.value.submission.daily_no}/confirm`); ElMessage.success('已确认'); const { data } = await axios.get(`${base}/${detail.value.submission.daily_no}`); if (data.code === 200) detail.value = data.data }
  catch (e: any) { ElMessage.error(e?.response?.data?.msg || '失败') }
}
const doDispatch = async () => {
  try { await ElMessageBox.confirm('下发后生成调拨单并锁定库存', '下发', { type: 'warning' }) } catch { return }
  try { const { data } = await axios.post(`${base}/${detail.value.submission.daily_no}/dispatch`); ElMessage.success(`下发 ${data.data.transferCount} 个调拨单`); const d = await axios.get(`${base}/${detail.value.submission.daily_no}`); if (d.data.code === 200) detail.value = d.data; fetchList() }
  catch (e: any) { ElMessage.error(e?.response?.data?.msg || '失败') }
}
const doExport = async () => {
  try { const resp = await axios.get(`${base}/${detail.value.submission.daily_no}/export`, { responseType: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(resp.data); const m = (resp.headers['content-disposition'] || '').match(/filename\*=UTF-8''(.+)/); a.download = m ? decodeURIComponent(m[1]) : '日计划.xlsx'; a.click() } catch { ElMessage.error('导出失败') }
}
const doDelete = async (row: any) => {
  try { await ElMessageBox.confirm('确定删除？', '确认', { type: 'warning' }) } catch { return }
  try { await axios.delete(`${base}/${row.daily_no}`); ElMessage.success('已删除'); fetchList() } catch { ElMessage.error('删除失败') }
}

onMounted(fetchList)
</script>

<template>
  <div class="daily-transfer">
    <div class="page-hd"><h3>📅 日分仓调拨需求提报</h3><el-button type="primary" @click="openCreate">新建日计划</el-button></div>

    <el-card shadow="never">
      <div class="bar">
        <el-input v-model="query.keyword" placeholder="搜索编号" clearable style="width:220px" @keydown.enter="page=1;fetchList()" @clear="page=1;fetchList()" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width:120px" @change="page=1;fetchList()"><el-option label="草稿" :value="0" /><el-option label="已确认" :value="1" /><el-option label="已下发" :value="2" /></el-select>
        <el-button type="primary" @click="page=1;fetchList()">查询</el-button>
      </div>
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="daily_no" label="日计划编号" width="200" />
        <el-table-column label="来源类型" width="100" align="center"><template #default="{row}">{{row.source_type==='COLD_CHAIN'?'🧊低温':'常温'}}</template></el-table-column>
        <el-table-column prop="source_submission_no" label="来源提报单" width="200" />
        <el-table-column label="日期范围" width="210"><template #default="{row}">{{row.date_range||'—'}}</template></el-table-column>
        <el-table-column prop="date_count" label="天数" width="70" align="center" />
        <el-table-column prop="line_count" label="行数" width="70" align="center" />
        <el-table-column label="状态" width="90" align="center"><template #default="{row}"><el-tag :type="STATUS_MAP[row.status]?.type" size="small">{{STATUS_MAP[row.status]?.label}}</el-tag></template></el-table-column>
        <el-table-column prop="created_time" label="创建时间" width="170" />
        <el-table-column label="操作" width="180" fixed="right"><template #default="{row}"><el-button link type="primary" size="small" @click="openDetail(row)">查看</el-button><el-button link type="danger" size="small" :disabled="row.status===2" @click="doDelete(row)">删除</el-button></template></el-table-column>
      </el-table>
      <div class="pager"><el-pagination background layout="total,prev,pager,next" :total="total" :page-size="pageSize" v-model:current-page="page" @current-change="fetchList" /></div>
    </el-card>

    <!-- Create -->
    <el-dialog v-model="createDlg" title="新建日分仓调拨计划" width="550px">
      <el-form label-width="110px">
        <el-form-item label="来源类型" required><el-radio-group v-model="createForm.source_type"><el-radio value="DEMAND_SUBMISSION">常温提报单</el-radio><el-radio value="COLD_CHAIN">低温提报单</el-radio></el-radio-group></el-form-item>
        <el-form-item label="来源提报单" required><el-select v-model="createForm.source_submission_no" placeholder="选择已确认/已下发的提报单" style="width:100%" filterable><el-option v-for="s in sources.filter((x:any)=>x.type===createForm.source_type)" :key="s.submission_no" :label="`${s.submission_no} | ${s.plan_name} | ${s.line_count}行`" :value="s.submission_no" /></el-select></el-form-item>
        <el-alert title="系统将自动把周度分配拆解为每日计划：跳过非工作日、应用提前期、按截单时间分段" type="info" show-icon :closable="false" />
      </el-form>
      <template #footer><el-button @click="createDlg=false">取消</el-button><el-button type="primary" :loading="createSaving" @click="handleCreate">创建日计划</el-button></template>
    </el-dialog>

    <!-- Detail -->
    <el-drawer v-model="drawer" title="日分仓调拨详情" size="92%">
      <template v-if="detail">
        <div class="sub-hd">
          <b>{{detail.submission.daily_no}}</b>
          <span>来源: {{detail.submission.source_type==='COLD_CHAIN'?'🧊低温':'常温'}} {{detail.submission.source_submission_no}}</span>
          <el-tag :type="STATUS_MAP[detail.submission.status]?.type" size="small">{{STATUS_MAP[detail.submission.status]?.label}}</el-tag>
          <span>{{detail.dates.length}}天 · {{detail.submission.line_count}}行</span>
        </div>

        <!-- Date picker chips -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          <el-tag v-for="d in detail.dates" :key="d" :type="d===currentDate?'primary':''" @click="changeDate(d)" style="cursor:pointer" size="large">{{d}}</el-tag>
        </div>

        <div v-if="currentDate" style="margin-bottom:8px;display:flex;gap:16px;align-items:center">
          <b>{{currentDate}}</b>
          <span style="font-size:13px;color:#909399">常温 {{dateLines.filter((l:any)=>l.temperature_zone!==2).length}} 行 | 低温 {{dateLines.filter((l:any)=>l.temperature_zone===2).length}} 行 | 合计 {{dateLines.reduce((s:number,l:any)=>s+(l.adjusted_qty||0),0)}} 件</span>
        </div>

        <el-table :data="dateLines" v-loading="detailLoading" stripe border size="small" max-height="calc(100vh - 320px)">
          <el-table-column label="仓" width="120"><template #default="{row}"><div>{{row.warehouse_name}}</div><div style="font-size:10px;color:#909399">{{row.warehouse_code}}</div></template></el-table-column>
          <el-table-column label="SKU" width="180"><template #default="{row}"><div>{{row.sku_code}}</div><div style="font-size:10px;color:#909399">{{row.sku_name}}</div></template></el-table-column>
          <el-table-column prop="channel_name" label="渠道" width="120" />
          <el-table-column prop="week" label="周" width="80" align="center" />
          <el-table-column prop="lead_days" label="提前期" width="65" align="center"><template #default="{row}">{{row.lead_days}}天</template></el-table-column>
          <el-table-column label="温层" width="60" align="center"><template #default="{row}"><span :style="{color:row.temperature_zone===2?'#409EFF':'#909399'}">{{row.temperature_zone===2?'低温':'常温'}}</span></template></el-table-column>
          <el-table-column label="原始分配" width="90" align="right"><template #default="{row}">{{row.allocated_qty}}</template></el-table-column>
          <el-table-column label="调整后" width="140" align="center">
            <template #default="{row}">
              <template v-if="editingLine?.id===row.id">
                <el-input v-model="editVal" size="small" style="width:80px" @keydown.enter="finishEdit" @blur="finishEdit" />
              </template>
              <template v-else>
                <span :style="{fontWeight:'bold',color:row.is_adjusted?'#e6a23c':'#303133',cursor:(detail.submission?.status||0)===0?'pointer':'default'}" @click="detail.submission?.status===0&&startEdit(row)">{{row.adjusted_qty}}</span>
                <span v-if="row.is_adjusted" style="font-size:10px;color:#e6a23c;margin-left:2px">改</span>
              </template>
            </template>
          </el-table-column>
          <el-table-column prop="transfer_no" label="调拨单号" width="180" />
        </el-table>
      </template>
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <el-button @click="doExport">导出</el-button>
          <el-button type="primary" :disabled="!(detail?.submission?.status===0)" @click="doConfirm">确认</el-button>
          <el-button type="success" :disabled="!(detail?.submission?.status===1)" @click="doDispatch">下发</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.daily-transfer{padding:20px}
.page-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.page-hd h3{margin:0;font-size:18px}
.bar{display:flex;gap:10px;margin-bottom:12px}
.pager{display:flex;justify-content:flex-end;margin-top:12px}
.sub-hd{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:#f5f7fa;border-radius:6px;margin-bottom:12px;font-size:14px}
</style>
