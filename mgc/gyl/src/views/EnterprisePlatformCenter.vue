<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const activeTab = ref('audit')
const pretty = (v: unknown) => JSON.stringify(v ?? {}, null, 2)

const auditQ = reactive({ page: 1, pageSize: 20, operatorName: '', moduleCode: '', actionType: '', dateFrom: '', dateTo: '' })
const auditRange = ref<string[]>([])
const auditRows = ref<any[]>([])
const auditTotal = ref(0)
const auditDetail = ref<any>(null)
const auditDetailVisible = ref(false)
const fetchAudit = async () => {
  auditQ.dateFrom = auditRange.value?.[0] || ''
  auditQ.dateTo = auditRange.value?.[1] || ''
  const { data } = await axios.get('/platform/audit-logs', { params: auditQ })
  auditRows.value = data?.data?.list || []
  auditTotal.value = Number(data?.data?.total || 0)
}
const openAudit = async (id: number) => {
  const { data } = await axios.get(`/platform/audit-logs/${id}`)
  auditDetail.value = data?.data || null
  auditDetailVisible.value = true
}
const exportAudit = async () => {
  const { data } = await axios.get('/platform/audit-logs/export', { params: auditQ, responseType: 'blob' })
  const href = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = href
  a.download = `audit_logs_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(href)
}

const secQ = reactive({ page: 1, pageSize: 20, eventType: '', result: '', riskLevel: '', username: '' })
const secRows = ref<any[]>([])
const secTotal = ref(0)
const secSummary = reactive({ loginSuccess: 0, loginFailed: 0, passwordResetCount: 0, permissionChangeCount: 0, abnormalLoginCount: 0 })
const fetchSecurity = async () => {
  const [{ data: list }, { data: sum }] = await Promise.all([
    axios.get('/platform/security/logs', { params: secQ }),
    axios.get('/platform/security/summary')
  ])
  secRows.value = list?.data?.list || []
  secTotal.value = Number(list?.data?.total || 0)
  Object.assign(secSummary, sum?.data || {})
}

const cfgRows = ref<any[]>([])
const cfgEditVisible = ref(false)
const cfgForm = reactive({ code: '', valueText: '{}', status: 1, note: '' })
const cfgVersions = ref<any[]>([])
const cfgVersionVisible = ref(false)
const fetchConfigs = async () => {
  const { data } = await axios.get('/platform/system-configs')
  cfgRows.value = data?.data || []
}
const editConfig = (row: any) => {
  cfgForm.code = row.config_code
  cfgForm.valueText = pretty(row.config_value)
  cfgForm.status = Number(row.status ?? 1)
  cfgForm.note = ''
  cfgEditVisible.value = true
}
const saveConfig = async () => {
  let val: unknown
  try { val = JSON.parse(cfgForm.valueText || '{}') } catch { ElMessage.error('配置值必须是 JSON'); return }
  await axios.put(`/platform/system-configs/${cfgForm.code}`, { configValue: val, status: cfgForm.status, changeNote: cfgForm.note || '控制台更新' })
  cfgEditVisible.value = false
  await fetchConfigs()
}
const openVersions = async (row: any) => {
  const { data } = await axios.get(`/platform/system-configs/${row.config_code}/versions`)
  cfgVersions.value = data?.data || []
  cfgVersionVisible.value = true
}

const policyRows = ref<any[]>([])
const jobQ = reactive({ page: 1, pageSize: 10 })
const jobRows = ref<any[]>([])
const jobTotal = ref(0)
const fetchArchive = async () => {
  const [{ data: p }, { data: j }] = await Promise.all([
    axios.get('/platform/archive/policies'),
    axios.get('/platform/archive/jobs', { params: jobQ })
  ])
  policyRows.value = p?.data || []
  jobRows.value = j?.data?.list || []
  jobTotal.value = Number(j?.data?.total || 0)
}
const savePolicy = async (row: any) => {
  await axios.put(`/platform/archive/policies/${row.id}`, { retentionDays: row.retention_days, status: row.status })
  ElMessage.success('策略已更新')
}
const runPolicy = async (row: any) => {
  await axios.post('/platform/archive/run', { policyCode: row.policy_code })
  ElMessage.success('归档执行成功')
  await fetchArchive()
}

const monitorWindow = ref(1440)
const monitor = reactive({ totalCalls: 0, errorRate: 0, slowApiCount: 0, apiTop: [] as any[], slowApis: [] as any[], taskSummary: { taskSuccessRate: 0 } })
const fetchMonitor = async () => {
  const { data } = await axios.get('/platform/monitor/overview', { params: { windowMinutes: monitorWindow.value } })
  Object.assign(monitor, data?.data || {})
}

const roleRows = ref<any[]>([])
const permQ = reactive({ roleId: '', modulePath: '' })
const permRows = ref<any[]>([])
const permEditVisible = ref(false)
const permForm = reactive({ id: 0, buttonCodes: '', dataScopeType: 'ALL', dataScopeConfigText: '{}', fieldPermissionsText: '[]' })
const fetchPerm = async () => {
  const params: any = {}
  if (permQ.roleId) params.roleId = permQ.roleId
  if (permQ.modulePath) params.modulePath = permQ.modulePath
  const [{ data: p }, { data: r }] = await Promise.all([
    axios.get('/platform/fine-permissions', { params }),
    axios.get('/roles')
  ])
  permRows.value = p?.data || []
  roleRows.value = r?.data || []
}
const editPerm = (row: any) => {
  permForm.id = Number(row.id)
  permForm.buttonCodes = (row.button_codes || []).join(',')
  permForm.dataScopeType = row.data_scope_type || 'ALL'
  permForm.dataScopeConfigText = pretty(row.data_scope_config || {})
  permForm.fieldPermissionsText = pretty(row.field_permissions || [])
  permEditVisible.value = true
}
const savePerm = async () => {
  let dataScopeConfig: unknown
  let fieldPermissions: unknown
  try { dataScopeConfig = JSON.parse(permForm.dataScopeConfigText || '{}') } catch { ElMessage.error('数据范围配置必须是 JSON'); return }
  try { fieldPermissions = JSON.parse(permForm.fieldPermissionsText || '[]') } catch { ElMessage.error('字段权限必须是 JSON 数组'); return }
  await axios.put(`/platform/fine-permissions/${permForm.id}`, {
    buttonCodes: permForm.buttonCodes,
    dataScopeType: permForm.dataScopeType,
    dataScopeConfig,
    fieldPermissions
  })
  permEditVisible.value = false
  await fetchPerm()
}

const health = reactive({ services: [] as any[], storage: {}, runtime: {}, task_status: {}, recent_errors: [] as any[] })
let timer: number | null = null
const fetchHealth = async () => {
  const { data } = await axios.get('/platform/health')
  Object.assign(health, data?.data || {})
}
const serviceTag = (s: string) => (s === 'UP' ? 'success' : (s === 'WARN' ? 'warning' : 'danger'))

onMounted(async () => {
  await Promise.all([fetchAudit(), fetchSecurity(), fetchConfigs(), fetchArchive(), fetchMonitor(), fetchPerm(), fetchHealth()])
  timer = window.setInterval(() => { if (activeTab.value === 'health') void fetchHealth() }, 60000)
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <div>企业级平台能力中心</div>
          <div class="sub">审计、安全、配置、归档、监控、精细权限、健康视图</div>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="审计日志查询页" name="audit">
          <div class="toolbar">
            <el-input v-model="auditQ.operatorName" placeholder="操作人" clearable style="width: 150px" />
            <el-input v-model="auditQ.moduleCode" placeholder="模块" clearable style="width: 130px" />
            <el-input v-model="auditQ.actionType" placeholder="动作" clearable style="width: 130px" />
            <el-date-picker v-model="auditRange" type="daterange" value-format="YYYY-MM-DD" style="width: 280px" />
            <el-button type="primary" @click="auditQ.page = 1; fetchAudit()">查询</el-button>
            <el-button @click="exportAudit">导出</el-button>
          </div>
          <el-table :data="auditRows" border>
            <el-table-column prop="created_at" label="时间" min-width="160" />
            <el-table-column prop="operator_name" label="操作人" width="120" />
            <el-table-column prop="module_code" label="模块" width="120" />
            <el-table-column prop="action_type" label="动作" width="120" />
            <el-table-column prop="message" label="摘要" min-width="260" show-overflow-tooltip />
            <el-table-column label="差异" width="170">
              <template #default="{ row }">{{ row.diff_summary?.changedCount || 0 }} 字段</template>
            </el-table-column>
            <el-table-column label="详情" width="90">
              <template #default="{ row }"><el-button link type="primary" @click="openAudit(row.id)">查看</el-button></template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" v-model:current-page="auditQ.page" v-model:page-size="auditQ.pageSize" layout="total, prev, pager, next" :total="auditTotal" @change="fetchAudit" />
        </el-tab-pane>

        <el-tab-pane label="登录日志与安全中心" name="security">
          <div class="summary">
            <span>成功 {{ secSummary.loginSuccess }}</span><span>失败 {{ secSummary.loginFailed }}</span><span>重置 {{ secSummary.passwordResetCount }}</span><span>权限变更 {{ secSummary.permissionChangeCount }}</span><span>异常登录 {{ secSummary.abnormalLoginCount }}</span>
          </div>
          <div class="toolbar">
            <el-select v-model="secQ.eventType" clearable placeholder="事件类型" style="width: 140px"><el-option label="登录" value="LOGIN" /><el-option label="密码重置" value="PASSWORD_RESET" /><el-option label="权限变更" value="PERMISSION_CHANGE" /></el-select>
            <el-select v-model="secQ.result" clearable placeholder="结果" style="width: 120px"><el-option label="成功" value="SUCCESS" /><el-option label="失败" value="FAILED" /></el-select>
            <el-select v-model="secQ.riskLevel" clearable placeholder="风险" style="width: 120px"><el-option label="LOW" value="LOW" /><el-option label="MEDIUM" value="MEDIUM" /><el-option label="HIGH" value="HIGH" /><el-option label="CRITICAL" value="CRITICAL" /></el-select>
            <el-input v-model="secQ.username" clearable placeholder="用户名" style="width: 160px" />
            <el-button type="primary" @click="secQ.page = 1; fetchSecurity()">查询</el-button>
          </div>
          <el-table :data="secRows" border>
            <el-table-column prop="created_at" label="时间" min-width="160" />
            <el-table-column prop="event_type" label="事件" width="150" />
            <el-table-column prop="username" label="用户名" width="140" />
            <el-table-column prop="result" label="结果" width="100" />
            <el-table-column prop="risk_level" label="风险级别" width="120" />
            <el-table-column prop="message" label="说明" min-width="240" show-overflow-tooltip />
          </el-table>
          <el-pagination class="pager" v-model:current-page="secQ.page" v-model:page-size="secQ.pageSize" layout="total, prev, pager, next" :total="secTotal" @change="fetchSecurity" />
        </el-tab-pane>

        <el-tab-pane label="系统配置中心" name="config">
          <el-table :data="cfgRows" border>
            <el-table-column prop="config_code" label="编码" min-width="160" />
            <el-table-column prop="config_name" label="名称" min-width="160" />
            <el-table-column prop="config_type" label="类型" min-width="150" />
            <el-table-column prop="version" label="版本" width="80" />
            <el-table-column prop="updated_at" label="更新时间" min-width="170" />
            <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link @click="editConfig(row)">编辑</el-button><el-button link @click="openVersions(row)">版本</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="数据归档策略" name="archive">
          <el-table :data="policyRows" border>
            <el-table-column prop="policy_code" label="编码" width="160" />
            <el-table-column prop="policy_name" label="名称" min-width="160" />
            <el-table-column prop="target_type" label="类型" width="130" />
            <el-table-column label="保留天数" width="130"><template #default="{ row }"><el-input-number v-model="row.retention_days" :min="1" /></template></el-table-column>
            <el-table-column label="启停" width="110"><template #default="{ row }"><el-switch v-model="row.status" :active-value="1" :inactive-value="0" /></template></el-table-column>
            <el-table-column label="操作" width="170"><template #default="{ row }"><el-button link @click="savePolicy(row)">保存</el-button><el-button link type="warning" @click="runPolicy(row)">执行</el-button></template></el-table-column>
          </el-table>
          <div class="sep">归档任务记录</div>
          <el-table :data="jobRows" border>
            <el-table-column prop="id" label="任务ID" width="90" />
            <el-table-column prop="policy_code" label="策略" width="140" />
            <el-table-column prop="target_type" label="类型" width="120" />
            <el-table-column prop="archived_count" label="归档数" width="100" />
            <el-table-column prop="operator_name" label="执行人" width="120" />
            <el-table-column prop="started_at" label="开始时间" min-width="160" />
            <el-table-column prop="finished_at" label="结束时间" min-width="160" />
          </el-table>
          <el-pagination class="pager" v-model:current-page="jobQ.page" v-model:page-size="jobQ.pageSize" layout="total, prev, pager, next" :total="jobTotal" @change="fetchArchive" />
        </el-tab-pane>

        <el-tab-pane label="接口与任务监控" name="monitor">
          <div class="toolbar"><el-select v-model="monitorWindow" style="width: 170px"><el-option :value="60" label="最近1小时" /><el-option :value="360" label="最近6小时" /><el-option :value="1440" label="最近24小时" /><el-option :value="10080" label="最近7天" /></el-select><el-button type="primary" @click="fetchMonitor">刷新</el-button></div>
          <div class="summary"><span>调用量 {{ monitor.totalCalls }}</span><span>错误率 {{ Number(monitor.errorRate || 0).toFixed(2) }}%</span><span>慢接口 {{ monitor.slowApiCount }}</span><span>任务成功率 {{ Number(monitor.taskSummary?.taskSuccessRate || 0).toFixed(2) }}%</span></div>
          <el-table :data="monitor.apiTop" border><el-table-column prop="api" label="接口" min-width="300" show-overflow-tooltip /><el-table-column prop="call_count" label="调用量" width="100" /><el-table-column prop="error_rate" label="错误率(%)" width="110" /><el-table-column prop="avg_duration_ms" label="平均耗时" width="120" /></el-table>
          <div class="sep">慢接口</div>
          <el-table :data="monitor.slowApis" border><el-table-column prop="api" label="接口" min-width="300" show-overflow-tooltip /><el-table-column prop="avg_duration_ms" label="平均耗时" width="120" /><el-table-column prop="max_duration_ms" label="最大耗时" width="120" /></el-table>
        </el-tab-pane>

        <el-tab-pane label="权限精细化控制" name="permission">
          <div class="toolbar">
            <el-select v-model="permQ.roleId" clearable placeholder="角色" style="width: 200px"><el-option v-for="r in roleRows" :key="r.id" :label="r.name" :value="String(r.id)" /></el-select>
            <el-input v-model="permQ.modulePath" clearable placeholder="模块路径" style="width: 220px" />
            <el-button type="primary" @click="fetchPerm">查询</el-button>
          </div>
          <el-table :data="permRows" border>
            <el-table-column prop="role_name" label="角色" width="180" />
            <el-table-column prop="module_path" label="路径" min-width="220" />
            <el-table-column label="按钮权限" min-width="220"><template #default="{ row }">{{ (row.button_codes || []).join(', ') || '-' }}</template></el-table-column>
            <el-table-column prop="data_scope_type" label="数据范围" width="130" />
            <el-table-column label="字段权限" min-width="220"><template #default="{ row }">{{ (row.field_permissions || []).length }} 项</template></el-table-column>
            <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="editPerm(row)">编辑</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="系统健康与运维视图" name="health">
          <div class="toolbar"><el-button type="primary" @click="fetchHealth">刷新</el-button></div>
          <el-table :data="health.services" border><el-table-column prop="service_name" label="服务" min-width="180" /><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="serviceTag(row.status)">{{ row.status }}</el-tag></template></el-table-column><el-table-column prop="message" label="说明" min-width="220" /></el-table>
          <div class="sep">最近错误</div>
          <el-table :data="health.recent_errors" border><el-table-column prop="type" label="类型" width="100" /><el-table-column prop="message" label="信息" min-width="260" show-overflow-tooltip /><el-table-column prop="trace_id" label="TraceId" min-width="220" show-overflow-tooltip /><el-table-column prop="created_at" label="时间" min-width="160" /></el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-drawer v-model="auditDetailVisible" title="审计详情" size="52%">
      <el-descriptions v-if="auditDetail" :column="2" border>
        <el-descriptions-item label="日志ID">{{ auditDetail.id }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ auditDetail.created_at }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ auditDetail.module_code }}</el-descriptions-item>
        <el-descriptions-item label="动作">{{ auditDetail.action_type }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ auditDetail.operator_name }}</el-descriptions-item>
        <el-descriptions-item label="对象">{{ auditDetail.biz_object_type }} / {{ auditDetail.biz_object_id }}</el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">请求快照</el-divider>
      <pre class="json">{{ pretty(auditDetail?.request_summary) }}</pre>
      <el-divider content-position="left">变更前后</el-divider>
      <pre class="json">{{ pretty({ before: auditDetail?.before_snapshot, after: auditDetail?.after_snapshot }) }}</pre>
    </el-drawer>

    <el-dialog v-model="cfgEditVisible" title="编辑配置" width="760px">
      <el-form label-width="100px">
        <el-form-item label="配置编码">{{ cfgForm.code }}</el-form-item>
        <el-form-item label="配置值(JSON)"><el-input v-model="cfgForm.valueText" type="textarea" :rows="10" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="cfgForm.status" :active-value="1" :inactive-value="0" /></el-form-item>
        <el-form-item label="变更说明"><el-input v-model="cfgForm.note" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="cfgEditVisible = false">取消</el-button><el-button type="primary" @click="saveConfig">保存</el-button></template>
    </el-dialog>

    <el-drawer v-model="cfgVersionVisible" title="配置版本记录" size="48%">
      <el-table :data="cfgVersions" border><el-table-column prop="version" label="版本" width="90" /><el-table-column prop="status" label="状态" width="80" /><el-table-column prop="changed_by" label="变更人" width="120" /><el-table-column prop="change_note" label="说明" min-width="200" /><el-table-column prop="changed_at" label="时间" min-width="160" /></el-table>
    </el-drawer>

    <el-dialog v-model="permEditVisible" title="编辑精细权限" width="760px">
      <el-form label-width="120px">
        <el-form-item label="按钮权限"><el-input v-model="permForm.buttonCodes" placeholder="多个按钮编码用逗号分隔" /></el-form-item>
        <el-form-item label="数据范围"><el-select v-model="permForm.dataScopeType" style="width: 180px"><el-option label="全部数据" value="ALL" /><el-option label="本部门" value="DEPT" /><el-option label="部门及下级" value="DEPT_AND_CHILD" /><el-option label="仅本人" value="SELF" /></el-select></el-form-item>
        <el-form-item label="数据范围配置(JSON)"><el-input v-model="permForm.dataScopeConfigText" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="字段权限(JSON数组)"><el-input v-model="permForm.fieldPermissionsText" type="textarea" :rows="6" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="permEditVisible = false">取消</el-button><el-button type="primary" @click="savePerm">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
.sub { margin-top: 4px; font-size: 12px; color: #64748b; font-weight: 400; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.pager { margin-top: 12px; justify-content: flex-end; }
.summary { display: flex; gap: 18px; margin-bottom: 12px; color: #475569; font-size: 13px; flex-wrap: wrap; }
.sep { margin: 12px 0 8px; color: #334155; font-weight: 600; }
.json { margin: 0; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; max-height: 260px; overflow: auto; font-size: 12px; }
</style>
