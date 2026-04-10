<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  Refresh,
  CircleCheck,
  CloseBold,
  Search,
  Warning
} from '@element-plus/icons-vue'
import axios from 'axios'

interface OptionItem {
  code: string
  label: string
  relation?: boolean
}

const activeTab = ref('request')
const loading = ref(false)

const objectTypes = ref<OptionItem[]>([])
const requestStatuses = ref<string[]>([])
const requestActions = ref<string[]>([])
const qualityRuleTypes = ref<string[]>([])
const effectiveStates = ref<string[]>([])
const conflictStatuses = ref<string[]>([])

const tagTypeMap: Record<string, any> = {
  DRAFT: 'info',
  PENDING: 'warning',
  REJECTED: 'danger',
  EFFECTIVE: 'success',
  OPEN: 'danger',
  PROCESSING: 'warning',
  RESOLVED: 'success',
  UPCOMING: 'warning',
  ACTIVE: 'success',
  NEAR_EXPIRY: 'danger',
  EXPIRED: 'info'
}

const toTagType = (status: string) => tagTypeMap[String(status || '').toUpperCase()] || 'info'

const loadConfig = async () => {
  const res = await axios.get('/master/governance/config')
  const data = res.data?.data || {}
  objectTypes.value = Array.isArray(data.object_types) ? data.object_types : []
  requestStatuses.value = Array.isArray(data.request_status) ? data.request_status : []
  requestActions.value = Array.isArray(data.request_action) ? data.request_action : []
  qualityRuleTypes.value = Array.isArray(data.quality_rule_types) ? data.quality_rule_types : []
  effectiveStates.value = Array.isArray(data.effective_states) ? data.effective_states : []
  conflictStatuses.value = Array.isArray(data.conflict_status) ? data.conflict_status : []
}

const objectTypeLabel = (code: string) => objectTypes.value.find((item) => item.code === code)?.label || code

const requestQuery = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
  objectType: '',
  action: ''
})
const requestRows = ref<any[]>([])
const requestTotal = ref(0)
const selectedRequest = ref<any>(null)
const requestLogs = ref<any[]>([])

const loadRequests = async () => {
  const res = await axios.get('/master/governance/requests', { params: requestQuery })
  requestRows.value = res.data?.data?.list || []
  requestTotal.value = res.data?.data?.total || 0
}

const loadRequestDetail = async (id: number) => {
  const res = await axios.get(`/master/governance/requests/${id}`)
  selectedRequest.value = res.data?.data?.request || null
  requestLogs.value = res.data?.data?.logs || []
}

const requestDialogVisible = ref(false)
const requestDialogSubmitting = ref(false)
const requestForm = reactive({
  object_type: 'SKU',
  action: 'UPDATE',
  target_code: '',
  reason: '',
  submit: true,
  change_after_text: '{\n  "sku_name": "示例新名称"\n}'
})

const openRequestDialog = () => {
  requestForm.object_type = objectTypes.value[0]?.code || 'SKU'
  requestForm.action = 'UPDATE'
  requestForm.target_code = ''
  requestForm.reason = ''
  requestForm.submit = true
  requestForm.change_after_text = '{\n  "sku_name": "示例新名称"\n}'
  requestDialogVisible.value = true
}

const parseJsonText = (text: string) => {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    throw new Error('JSON 必须是对象')
  } catch {
    throw new Error('变更内容 JSON 解析失败')
  }
}

const createRequest = async () => {
  if (!requestForm.reason.trim()) return ElMessage.warning('请填写申请原因')
  if (requestForm.action !== 'CREATE' && !requestForm.target_code.trim()) {
    return ElMessage.warning('请输入目标编码')
  }

  requestDialogSubmitting.value = true
  try {
    const payload: any = {
      object_type: requestForm.object_type,
      action: requestForm.action,
      target_code: requestForm.target_code,
      reason: requestForm.reason,
      submit: requestForm.submit,
      change_after: parseJsonText(requestForm.change_after_text)
    }
    await axios.post('/master/governance/requests', payload)
    ElMessage.success('申请单创建成功')
    requestDialogVisible.value = false
    await loadRequests()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || e.message || '创建失败')
  } finally {
    requestDialogSubmitting.value = false
  }
}

const submitRequest = async (row: any) => {
  await axios.post(`/master/governance/requests/${row.id}/submit`, {})
  ElMessage.success('提交成功')
  await loadRequests()
}

const resubmitRequest = async (row: any) => {
  await axios.post(`/master/governance/requests/${row.id}/resubmit`, {})
  ElMessage.success('重新提交成功')
  await loadRequests()
}

const reviewRequest = async (row: any, action: 'APPROVE' | 'REJECT') => {
  const title = action === 'APPROVE' ? '审批通过' : '审批驳回'
  const result = await ElMessageBox.prompt('请输入审批意见（可选）', title, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: ''
  }).catch(() => null)
  if (!result) return

  await axios.post(`/master/governance/requests/${row.id}/review`, {
    action,
    comment: result.value || ''
  })
  ElMessage.success(`${title}成功`)
  await loadRequests()
  if (selectedRequest.value?.id === row.id) await loadRequestDetail(row.id)
}

const versionQuery = reactive({
  page: 1,
  pageSize: 10,
  objectType: '',
  targetCode: ''
})
const versionRows = ref<any[]>([])
const versionTotal = ref(0)
const versionDiffDialog = ref(false)
const versionDiffRow = ref<any>(null)

const loadVersions = async () => {
  const res = await axios.get('/master/governance/versions', { params: versionQuery })
  versionRows.value = res.data?.data?.list || []
  versionTotal.value = res.data?.data?.total || 0
}

const openVersionDiff = async (row: any) => {
  const res = await axios.get(`/master/governance/versions/${row.id}/diff`)
  versionDiffRow.value = res.data?.data || row
  versionDiffDialog.value = true
}

const effectiveQuery = reactive({
  page: 1,
  pageSize: 10,
  objectType: '',
  state: '',
  keyword: '',
  dateRange: [] as string[]
})
const effectiveRows = ref<any[]>([])
const effectiveTotal = ref(0)

const loadEffectiveRows = async () => {
  const params: any = {
    page: effectiveQuery.page,
    pageSize: effectiveQuery.pageSize,
    objectType: effectiveQuery.objectType,
    state: effectiveQuery.state,
    keyword: effectiveQuery.keyword
  }
  if (effectiveQuery.dateRange.length === 2) {
    params.startDate = effectiveQuery.dateRange[0]
    params.endDate = effectiveQuery.dateRange[1]
  }
  const res = await axios.get('/master/governance/effective', { params })
  effectiveRows.value = res.data?.data?.list || []
  effectiveTotal.value = res.data?.data?.total || 0
}

const ruleQuery = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  type: '',
  objectType: '',
  status: ''
})
const ruleRows = ref<any[]>([])
const ruleTotal = ref(0)

const issueQuery = reactive({
  page: 1,
  pageSize: 10,
  runId: '',
  status: '',
  objectType: '',
  keyword: ''
})
const issueRows = ref<any[]>([])
const issueTotal = ref(0)

const loadRules = async () => {
  const res = await axios.get('/master/governance/quality/rules', { params: ruleQuery })
  ruleRows.value = res.data?.data?.list || []
  ruleTotal.value = res.data?.data?.total || 0
}

const loadIssues = async () => {
  const res = await axios.get('/master/governance/quality/issues', { params: issueQuery })
  issueRows.value = res.data?.data?.list || []
  issueTotal.value = res.data?.data?.total || 0
}
const runQualityCheck = async () => {
  await axios.post('/master/governance/quality/run', {})
  ElMessage.success('质量校验完成')
  await loadIssues()
}

const resolveIssue = async (row: any) => {
  const result = await ElMessageBox.prompt('请输入处理说明', '处理质量问题', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: row.resolution || '已修复'
  }).catch(() => null)
  if (!result) return
  await axios.post(`/master/governance/quality/issues/${row.id}/resolve`, {
    resolution: result.value || '已处理'
  })
  ElMessage.success('处理成功')
  await loadIssues()
}

const ruleDialogVisible = ref(false)
const ruleDialogSubmitting = ref(false)
const ruleForm = reactive({
  rule_code: '',
  rule_name: '',
  rule_type: 'UNIQUE',
  object_type: 'SKU',
  status: 1,
  config_text: '{\n  "fields": ["sku_code"]\n}',
  remark: ''
})

const openRuleDialog = () => {
  ruleForm.rule_code = ''
  ruleForm.rule_name = ''
  ruleForm.rule_type = qualityRuleTypes.value[0] || 'UNIQUE'
  ruleForm.object_type = objectTypes.value[0]?.code || 'SKU'
  ruleForm.status = 1
  ruleForm.config_text = '{\n  "fields": ["sku_code"]\n}'
  ruleForm.remark = ''
  ruleDialogVisible.value = true
}

const createRule = async () => {
  if (!ruleForm.rule_code.trim()) return ElMessage.warning('请输入规则编码')
  if (!ruleForm.rule_name.trim()) return ElMessage.warning('请输入规则名称')
  ruleDialogSubmitting.value = true
  try {
    await axios.post('/master/governance/quality/rules', {
      rule_code: ruleForm.rule_code,
      rule_name: ruleForm.rule_name,
      rule_type: ruleForm.rule_type,
      object_type: ruleForm.object_type,
      status: ruleForm.status,
      config: parseJsonText(ruleForm.config_text),
      remark: ruleForm.remark
    })
    ElMessage.success('规则创建成功')
    ruleDialogVisible.value = false
    await loadRules()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || e.message || '创建失败')
  } finally {
    ruleDialogSubmitting.value = false
  }
}

const taskRows = ref<any[]>([])
const taskTotal = ref(0)
const conflictQuery = reactive({
  page: 1,
  pageSize: 10,
  taskId: '',
  status: '',
  keyword: ''
})
const conflictRows = ref<any[]>([])
const conflictTotal = ref(0)

const loadConflictTasks = async () => {
  const res = await axios.get('/master/governance/conflicts/tasks', { params: { page: 1, pageSize: 50 } })
  taskRows.value = res.data?.data?.list || []
  taskTotal.value = res.data?.data?.total || 0
}

const loadConflicts = async () => {
  const res = await axios.get('/master/governance/conflicts', { params: conflictQuery })
  conflictRows.value = res.data?.data?.list || []
  conflictTotal.value = res.data?.data?.total || 0
}

const runConflictTask = async () => {
  await axios.post('/master/governance/conflicts/tasks/run', {})
  ElMessage.success('冲突检测完成')
  await loadConflictTasks()
  await loadConflicts()
}

const handleConflict = async (row: any, status: string) => {
  const result = await ElMessageBox.prompt('请输入处理说明（可选）', '冲突处理', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: row.handle_comment || ''
  }).catch(() => null)
  if (!result) return
  await axios.post(`/master/governance/conflicts/${row.id}/handle`, {
    status,
    comment: result.value || ''
  })
  ElMessage.success('处理成功')
  await loadConflicts()
}

const referenceForm = reactive({
  object_type: 'SKU',
  target_code: ''
})
const referenceUsage = ref<any>(null)
const disableRisk = ref<any>(null)

const loadReferenceUsage = async () => {
  if (!referenceForm.target_code.trim()) return ElMessage.warning('请输入目标编码')
  const res = await axios.get('/master/governance/references', {
    params: {
      objectType: referenceForm.object_type,
      targetCode: referenceForm.target_code
    }
  })
  referenceUsage.value = res.data?.data || null
}

const checkDisableRisk = async () => {
  if (!referenceForm.target_code.trim()) return ElMessage.warning('请输入目标编码')
  const res = await axios.post('/master/governance/disable-check', {
    object_type: referenceForm.object_type,
    target_code: referenceForm.target_code
  })
  disableRisk.value = res.data?.data || null
}

const createDisableRequest = async () => {
  if (!referenceForm.target_code.trim()) return ElMessage.warning('请输入目标编码')
  const result = await ElMessageBox.prompt('请输入停用原因', '发起停用审批', {
    confirmButtonText: '确认创建',
    cancelButtonText: '取消',
    inputValue: '停用申请'
  }).catch(() => null)
  if (!result) return

  await axios.post('/master/governance/disable-requests', {
    object_type: referenceForm.object_type,
    target_code: referenceForm.target_code,
    reason: result.value || '停用申请',
    submit: true
  })
  ElMessage.success('停用审批单已创建')
  await loadRequests()
}

const requestChangedFields = computed(() => selectedRequest.value?.changed_fields || [])

const initialize = async () => {
  loading.value = true
  try {
    await loadConfig()
    await Promise.all([
      loadRequests(),
      loadVersions(),
      loadEffectiveRows(),
      loadRules(),
      loadIssues(),
      loadConflictTasks(),
      loadConflicts()
    ])
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '初始化失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initialize()
})
</script>
<template>
  <div class="governance-page" v-loading="loading">
    <div class="page-header">
      <div>
        <h2>主数据治理平台</h2>
        <p>覆盖变更申请、审批、版本、生效期、质量、冲突、引用与停用控制</p>
      </div>
      <el-button type="primary" :icon="Refresh" @click="initialize">刷新全部</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="申请审批" name="request">
        <div class="toolbar">
          <el-form :inline="true" :model="requestQuery" @submit.prevent>
            <el-form-item>
              <el-input v-model="requestQuery.keyword" placeholder="申请单号/对象编码/原因" clearable style="width: 220px" :prefix-icon="Search" />
            </el-form-item>
            <el-form-item>
              <el-select v-model="requestQuery.status" placeholder="状态" clearable style="width: 120px">
                <el-option v-for="item in requestStatuses" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-select v-model="requestQuery.objectType" placeholder="对象" clearable style="width: 160px">
                <el-option v-for="item in objectTypes" :key="item.code" :label="item.label" :value="item.code" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-select v-model="requestQuery.action" placeholder="动作" clearable style="width: 120px">
                <el-option v-for="item in requestActions" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadRequests">查询</el-button>
              <el-button :icon="Plus" @click="openRequestDialog">新建申请</el-button>
            </el-form-item>
          </el-form>
        </div>

        <el-table :data="requestRows" border stripe @row-click="(row: any) => loadRequestDetail(row.id)">
          <el-table-column prop="request_no" label="申请单号" width="180" />
          <el-table-column prop="object_type" label="对象" width="120">
            <template #default="{ row }">{{ objectTypeLabel(row.object_type) }}</template>
          </el-table-column>
          <el-table-column prop="action" label="动作" width="100" />
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="toTagType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="target_code" label="目标编码" min-width="160" />
          <el-table-column prop="reason" label="申请原因" min-width="220" show-overflow-tooltip />
          <el-table-column prop="updated_at" label="更新时间" width="170" />
          <el-table-column label="操作" width="260" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="['DRAFT','REJECTED'].includes(row.status)" type="primary" link size="small" @click.stop="submitRequest(row)">提交</el-button>
              <el-button v-if="row.status === 'REJECTED'" type="warning" link size="small" @click.stop="resubmitRequest(row)">重提</el-button>
              <el-button v-if="row.status === 'PENDING'" type="success" link size="small" @click.stop="reviewRequest(row, 'APPROVE')">通过</el-button>
              <el-button v-if="row.status === 'PENDING'" type="danger" link size="small" @click.stop="reviewRequest(row, 'REJECT')">驳回</el-button>
              <el-button type="info" link size="small" @click.stop="loadRequestDetail(row.id)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="requestQuery.page"
            v-model:page-size="requestQuery.pageSize"
            :total="requestTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="loadRequests"
            @size-change="loadRequests"
          />
        </div>

        <div class="detail-section" v-if="selectedRequest">
          <el-descriptions :column="2" border title="申请详情">
            <el-descriptions-item label="申请单号">{{ selectedRequest.request_no }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ selectedRequest.status }}</el-descriptions-item>
            <el-descriptions-item label="对象">{{ objectTypeLabel(selectedRequest.object_type) }}</el-descriptions-item>
            <el-descriptions-item label="动作">{{ selectedRequest.action }}</el-descriptions-item>
            <el-descriptions-item label="目标编码">{{ selectedRequest.target_code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="申请原因">{{ selectedRequest.reason || '-' }}</el-descriptions-item>
          </el-descriptions>

          <el-table :data="requestChangedFields" border size="small" style="margin-top: 12px">
            <el-table-column prop="field" label="字段" width="180" />
            <el-table-column prop="before" label="变更前" min-width="180" show-overflow-tooltip />
            <el-table-column prop="after" label="变更后" min-width="180" show-overflow-tooltip />
          </el-table>

          <el-table :data="requestLogs" border size="small" style="margin-top: 12px">
            <el-table-column prop="action" label="动作" width="120" />
            <el-table-column prop="operator" label="操作人" width="120" />
            <el-table-column prop="comment" label="意见" min-width="180" show-overflow-tooltip />
            <el-table-column prop="created_at" label="时间" width="170" />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="版本追溯" name="version">
        <div class="toolbar">
          <el-form :inline="true" :model="versionQuery" @submit.prevent>
            <el-form-item>
              <el-select v-model="versionQuery.objectType" placeholder="对象" clearable style="width: 160px">
                <el-option v-for="item in objectTypes" :key="item.code" :label="item.label" :value="item.code" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-input v-model="versionQuery.targetCode" placeholder="目标编码" clearable style="width: 220px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadVersions">查询</el-button>
            </el-form-item>
          </el-form>
        </div>

        <el-table :data="versionRows" border stripe>
          <el-table-column prop="version_no" label="版本" width="80" />
          <el-table-column prop="object_type" label="对象" width="120">
            <template #default="{ row }">{{ objectTypeLabel(row.object_type) }}</template>
          </el-table-column>
          <el-table-column prop="target_code" label="目标编码" min-width="180" />
          <el-table-column prop="action" label="动作" width="100" />
          <el-table-column prop="operator" label="生效人" width="120" />
          <el-table-column prop="effective_at" label="生效时间" width="180" />
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button type="primary" link @click="openVersionDiff(row)">字段对比</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="versionQuery.page"
            v-model:page-size="versionQuery.pageSize"
            :total="versionTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="loadVersions"
            @size-change="loadVersions"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="生效期治理" name="effective">
        <div class="toolbar">
          <el-form :inline="true" :model="effectiveQuery" @submit.prevent>
            <el-form-item>
              <el-select v-model="effectiveQuery.objectType" placeholder="关系对象" clearable style="width: 160px">
                <el-option v-for="item in objectTypes.filter((x) => x.relation)" :key="item.code" :label="item.label" :value="item.code" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-select v-model="effectiveQuery.state" placeholder="生效状态" clearable style="width: 140px">
                <el-option v-for="item in effectiveStates" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-date-picker v-model="effectiveQuery.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="effectiveQuery.keyword" placeholder="编码/名称关键字" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadEffectiveRows">查询</el-button>
            </el-form-item>
          </el-form>
        </div>

        <el-table :data="effectiveRows" border stripe>
          <el-table-column prop="object_label" label="对象" width="140" />
          <el-table-column prop="target_code" label="目标编码" min-width="160" />
          <el-table-column prop="target_name" label="目标名称" min-width="160" />
          <el-table-column prop="begin_date" label="开始日期" width="120" />
          <el-table-column prop="end_date" label="结束日期" width="120" />
          <el-table-column prop="effective_state" label="状态" width="120" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="toTagType(row.effective_state)">{{ row.effective_state }}</el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="effectiveQuery.page"
            v-model:page-size="effectiveQuery.pageSize"
            :total="effectiveTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="loadEffectiveRows"
            @size-change="loadEffectiveRows"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="质量规则" name="quality">
        <div class="toolbar between">
          <el-form :inline="true" :model="ruleQuery" @submit.prevent>
            <el-form-item>
              <el-input v-model="ruleQuery.keyword" placeholder="规则编码/名称" clearable style="width: 220px" />
            </el-form-item>
            <el-form-item>
              <el-select v-model="ruleQuery.type" placeholder="规则类型" clearable style="width: 140px">
                <el-option v-for="item in qualityRuleTypes" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-select v-model="ruleQuery.objectType" placeholder="对象" clearable style="width: 140px">
                <el-option v-for="item in objectTypes" :key="item.code" :label="item.label" :value="item.code" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadRules">查询规则</el-button>
            </el-form-item>
          </el-form>
          <div>
            <el-button :icon="Plus" @click="openRuleDialog">新增规则</el-button>
            <el-button type="success" :icon="CircleCheck" @click="runQualityCheck">执行校验</el-button>
          </div>
        </div>
        <el-table :data="ruleRows" border stripe>
          <el-table-column prop="rule_code" label="规则编码" width="180" />
          <el-table-column prop="rule_name" label="规则名称" min-width="180" />
          <el-table-column prop="rule_type" label="类型" width="120" />
          <el-table-column prop="object_type" label="对象" width="120">
            <template #default="{ row }">{{ objectTypeLabel(row.object_type) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="toolbar" style="margin-top: 16px">
          <el-form :inline="true" :model="issueQuery" @submit.prevent>
            <el-form-item>
              <el-input v-model="issueQuery.keyword" placeholder="问题关键字" clearable style="width: 220px" />
            </el-form-item>
            <el-form-item>
              <el-select v-model="issueQuery.status" placeholder="问题状态" clearable style="width: 120px">
                <el-option label="OPEN" value="OPEN" />
                <el-option label="RESOLVED" value="RESOLVED" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadIssues">查询问题</el-button>
            </el-form-item>
          </el-form>
        </div>

        <el-table :data="issueRows" border stripe>
          <el-table-column prop="rule_name" label="规则" width="180" />
          <el-table-column prop="object_type" label="对象" width="120">
            <template #default="{ row }">{{ objectTypeLabel(row.object_type) }}</template>
          </el-table-column>
          <el-table-column prop="target_code" label="目标编码" width="160" />
          <el-table-column prop="message" label="问题描述" min-width="220" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="toTagType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button v-if="row.status !== 'RESOLVED'" type="success" link @click="resolveIssue(row)">处理</el-button>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="冲突检测" name="conflict">
        <div class="toolbar between">
          <el-alert type="warning" :closable="false" show-icon>
            支持检测授权时间重叠、组织关系重复、产品SKU转换冲突、仓库SKU缺失。
          </el-alert>
          <el-button type="primary" :icon="Warning" @click="runConflictTask">执行冲突检测</el-button>
        </div>

        <el-table :data="taskRows" border stripe style="margin-top: 12px">
          <el-table-column prop="task_no" label="任务号" width="180" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column prop="total_conflicts" label="冲突数" width="100" />
          <el-table-column prop="operator" label="执行人" width="120" />
          <el-table-column prop="finished_at" label="完成时间" width="180" />
        </el-table>

        <div class="toolbar" style="margin-top: 12px">
          <el-form :inline="true" :model="conflictQuery" @submit.prevent>
            <el-form-item>
              <el-input v-model="conflictQuery.keyword" placeholder="冲突关键字" clearable style="width: 220px" />
            </el-form-item>
            <el-form-item>
              <el-select v-model="conflictQuery.status" placeholder="状态" clearable style="width: 120px">
                <el-option v-for="item in conflictStatuses" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadConflicts">查询冲突</el-button>
            </el-form-item>
          </el-form>
        </div>

        <el-table :data="conflictRows" border stripe>
          <el-table-column prop="conflict_type" label="冲突类型" width="220" />
          <el-table-column prop="conflict_title" label="冲突描述" min-width="220" />
          <el-table-column prop="target_code" label="目标编码" width="180" />
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="toTagType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="handler" label="处理人" width="120" />
          <el-table-column label="操作" width="180" align="center">
            <template #default="{ row }">
              <el-button v-if="row.status === 'OPEN'" type="warning" link @click="handleConflict(row, 'PROCESSING')">转处理中</el-button>
              <el-button v-if="row.status !== 'RESOLVED'" type="success" link @click="handleConflict(row, 'RESOLVED')">标记解决</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="引用与停用" name="reference">
        <div class="toolbar">
          <el-form :inline="true" :model="referenceForm" @submit.prevent>
            <el-form-item>
              <el-select v-model="referenceForm.object_type" style="width: 150px">
                <el-option v-for="item in objectTypes" :key="item.code" :label="item.label" :value="item.code" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-input v-model="referenceForm.target_code" placeholder="目标编码（如 SKU-P001）" style="width: 260px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadReferenceUsage">查询引用</el-button>
              <el-button :icon="Warning" @click="checkDisableRisk">停用风险检查</el-button>
              <el-button type="danger" :icon="CloseBold" @click="createDisableRequest">发起停用审批</el-button>
            </el-form-item>
          </el-form>
        </div>

        <el-descriptions v-if="referenceUsage" :column="5" border>
          <el-descriptions-item label="订单引用">{{ referenceUsage.summary?.order_refs || 0 }}</el-descriptions-item>
          <el-descriptions-item label="库存引用">{{ referenceUsage.summary?.inventory_refs || 0 }}</el-descriptions-item>
          <el-descriptions-item label="关系引用">{{ referenceUsage.summary?.relation_refs || 0 }}</el-descriptions-item>
          <el-descriptions-item label="调拨引用">{{ referenceUsage.summary?.transfer_refs || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总引用">{{ referenceUsage.summary?.total_refs || 0 }}</el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="disableRisk"
          style="margin-top: 12px"
          :type="disableRisk.risk?.level === 'HIGH' ? 'error' : (disableRisk.risk?.level === 'MEDIUM' ? 'warning' : 'success')"
          :title="`风险等级：${disableRisk.risk?.level || 'LOW'}`"
          :description="(disableRisk.risk?.messages || []).join('；')"
          show-icon
          :closable="false"
        />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="requestDialogVisible" title="新建主数据申请单" width="680px" :close-on-click-modal="false">
      <el-form label-width="110px">
        <el-form-item label="对象类型">
          <el-select v-model="requestForm.object_type" style="width: 100%">
            <el-option v-for="item in objectTypes" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更动作">
          <el-select v-model="requestForm.action" style="width: 100%">
            <el-option v-for="item in requestActions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标编码" v-if="requestForm.action !== 'CREATE'">
          <el-input v-model="requestForm.target_code" placeholder="填写已有主数据编码" />
        </el-form-item>
        <el-form-item label="申请原因">
          <el-input v-model="requestForm.reason" type="textarea" :rows="2" placeholder="请说明变更原因" />
        </el-form-item>
        <el-form-item label="变更内容JSON">
          <el-input v-model="requestForm.change_after_text" type="textarea" :rows="8" />
        </el-form-item>
        <el-form-item label="立即提交">
          <el-switch v-model="requestForm.submit" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="requestDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="requestDialogSubmitting" @click="createRequest">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ruleDialogVisible" title="新增质量规则" width="680px" :close-on-click-modal="false">
      <el-form label-width="110px">
        <el-form-item label="规则编码"><el-input v-model="ruleForm.rule_code" /></el-form-item>
        <el-form-item label="规则名称"><el-input v-model="ruleForm.rule_name" /></el-form-item>
        <el-form-item label="规则类型">
          <el-select v-model="ruleForm.rule_type" style="width: 100%">
            <el-option v-for="item in qualityRuleTypes" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="对象类型">
          <el-select v-model="ruleForm.object_type" style="width: 100%">
            <el-option v-for="item in objectTypes" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="配置JSON"><el-input v-model="ruleForm.config_text" type="textarea" :rows="8" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="ruleForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="ruleDialogSubmitting" @click="createRule">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="versionDiffDialog" title="版本字段对比" width="760px">
      <el-table :data="versionDiffRow?.changed_fields || []" border>
        <el-table-column prop="field" label="字段" width="180" />
        <el-table-column prop="before" label="变更前" min-width="180" show-overflow-tooltip />
        <el-table-column prop="after" label="变更后" min-width="180" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.governance-page {
  padding: 20px;
  background: #f8fafc;
  min-height: calc(100vh - 60px);
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.page-header h2 {
  margin: 0;
  font-size: 22px;
  color: #0f172a;
}
.page-header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}
.toolbar {
  margin-bottom: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 10px;
}
.toolbar.between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}
.detail-section {
  margin-top: 12px;
  background: #fff;
  padding: 12px;
  border-radius: 10px;
}
</style>
