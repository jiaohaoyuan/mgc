<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const router = useRouter()
const appStore = useAppStore()
const isSuperAdmin = computed(() => appStore.isSuperAdmin)

const planQuery = reactive({
  keyword: '',
  status: '',
  planType: '',
  createType: ''
})

const lockRuleQuery = reactive({
  keyword: '',
  lifecycleStatus: ''
})

const options = reactive<{
  channels: Array<{ channel_code: string, channel_name: string }>
  skus: Array<{ sku_code: string, sku_name: string }>
  categories: Array<{ category_code: string, category_name: string }>
}>({
  channels: [],
  skus: [],
  categories: []
})

const loading = ref(false)
const planRows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const versionDrawerVisible = ref(false)
const versionLoading = ref(false)
const versionRows = ref<any[]>([])
const activePlan = ref<any | null>(null)
const submissionLookup = ref<Record<string, any>>({})
const submissionLookupLoading = ref(false)

const planDialogVisible = ref(false)
const versionDialogVisible = ref(false)
const versionDetailVisible = ref(false)
const lockRuleDrawerVisible = ref(false)
const lockRuleDialogVisible = ref(false)
const rollDialogVisible = ref(false)
const compareDialogVisible = ref(false)

const planSaving = ref(false)
const versionSaving = ref(false)
const detailLoading = ref(false)
const lockRuleLoading = ref(false)
const lockRuleSaving = ref(false)
const rebuildLocking = ref(false)
const rollingVersion = ref(false)
const compareLoading = ref(false)
const exportingVersionCode = ref('')

const lockRules = ref<any[]>([])
const editingLockRuleId = ref<number | null>(null)

const planForm = reactive({
  plan_name: '',
  plan_type: 1,
  create_type: 1,
  week_count: 8,
  channel_scope: 1,
  sku_scope: 1,
  channel_codes: [] as string[],
  sku_codes: [] as string[],
  remark: ''
})

const versionForm = reactive({
  version_code: '',
  version_label: '',
  begin_week: '',
  week_count: 8,
  last_version_code: ''
})

const rollForm = reactive({
  reference_version_code: '',
  begin_week: '',
  week_count: 8,
  version_label: ''
})

const lockRuleForm = reactive({
  sku_code: '',
  channel_codes: [] as string[],
  start_date: '',
  end_date: '',
  remark: ''
})

const compareForm = reactive({
  source_version_code: '',
  target_version_code: '',
  only_changed: true
})

const compareActiveChannels = ref<string[]>([])
const compareResult = reactive<{
  source_version: any | null
  target_version: any | null
  summary: Record<string, number>
  rows: any[]
  channel_groups: any[]
}>({
  source_version: null,
  target_version: null,
  summary: {},
  rows: [],
  channel_groups: []
})

const versionDetail = reactive<{
  plan: any | null
  version: any | null
  weeks: any[]
  channel_statuses: any[]
  selected_channel_code: string
  selected_channel_name: string
  data_rows: any[]
  lock_summary: { locked_count: number, editable_count: number }
}>({
  plan: null,
  version: null,
  weeks: [],
  channel_statuses: [],
  selected_channel_code: '',
  selected_channel_name: '',
  data_rows: [],
  lock_summary: { locked_count: 0, editable_count: 0 }
})

const draftValues = reactive<Record<string, number | undefined>>({})

const resetPlanForm = () => {
  Object.assign(planForm, {
    plan_name: '',
    plan_type: 1,
    create_type: 1,
    week_count: 8,
    channel_scope: 1,
    sku_scope: 1,
    channel_codes: [],
    sku_codes: [],
    remark: ''
  })
}

const resetVersionForm = () => {
  Object.assign(versionForm, {
    version_code: '',
    version_label: '',
    begin_week: '',
    week_count: activePlan.value?.week_count || 8,
    last_version_code: versionRows.value[0]?.version_code || ''
  })
}

const resetRollForm = () => {
  const refCode = versionRows.value[0]?.version_code || ''
  Object.assign(rollForm, {
    reference_version_code: refCode,
    begin_week: '',
    week_count: activePlan.value?.week_count || 8,
    version_label: ''
  })
  // Pre-fill suggested begin_week based on reference version's end
  const refVer = versionRows.value.find((v: any) => v.version_code === refCode)
  if (refVer?.end_week) {
    rollForm.begin_week = activePlan.value?.plan_type === 2
      ? refVer.end_week.replace('W', 'M')
      : (addWeeksToWeekCode(refVer.end_week, 1) || '')
  }
}

const resetLockRuleForm = () => {
  editingLockRuleId.value = null
  Object.assign(lockRuleForm, {
    sku_code: '',
    channel_codes: [],
    start_date: '',
    end_date: '',
    remark: ''
  })
}

const resetCompareForm = () => {
  Object.assign(compareForm, {
    source_version_code: versionRows.value[0]?.version_code || '',
    target_version_code: versionRows.value[1]?.version_code || '',
    only_changed: true
  })
  compareResult.source_version = null
  compareResult.target_version = null
  compareResult.summary = {}
  compareResult.rows = []
  compareResult.channel_groups = []
  compareActiveChannels.value = []
}

const buildCellKey = (skuCode: string, planWeek: string) => `${skuCode}__${planWeek}`

const addWeeksToWeekCode = (weekCode: string, offset: number) => {
  const match = /^(\d{4})W(0[1-9]|[1-4]\d|5[0-3])$/.exec(weekCode?.trim())
  if (!match) return null
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7 + offset * 7)
  const targetJan4 = new Date(Date.UTC(jan4.getUTCFullYear(), 0, 4))
  const targetJan4Day = targetJan4.getUTCDay() || 7
  targetJan4.setUTCDate(targetJan4.getUTCDate() - targetJan4Day + 1)
  const targetWeek = Math.ceil(((jan4.getTime() - targetJan4.getTime()) / 86400000 + 1) / 7)
  return `${jan4.getUTCFullYear()}W${String(targetWeek).padStart(2, '0')}`
}

const rollReferenceVersion = computed(() =>
  versionRows.value.find((v: any) => v.version_code === rollForm.reference_version_code) || null
)

const suggestedRollBeginWeek = computed(() => {
  if (!rollReferenceVersion.value?.end_week) return ''
  return activePlan.value?.plan_type === 2
    ? rollReferenceVersion.value.end_week.replace(/W/, 'M')
    : addWeeksToWeekCode(rollReferenceVersion.value.end_week, 1) || ''
})

watch(() => rollForm.reference_version_code, () => {
  rollForm.begin_week = suggestedRollBeginWeek.value
})

const statusText = (status: unknown) => {
  const value = String(status ?? '')
  if (value === '3') return '已确认'
  if (value === '2') return '待确认'
  if (value === '1') return '提交中'
  return '草稿'
}

const createTypeText = (type: unknown) => String(type) === '2' ? '滚动自动' : '手动'

const lifecycleTagType = (status: string) => {
  if (status === 'ACTIVE') return 'danger'
  if (status === 'EXPIRED') return 'info'
  return 'success'
}

const formatCompareValue = (value: unknown) => value === null || value === undefined || value === '' ? '-' : String(value)

const expandAllChannels = () => {
  compareActiveChannels.value = compareResult.channel_groups.map((g: any) => g.lv2_channel_code)
}
const collapseAllChannels = () => {
  compareActiveChannels.value = []
}

const hydrateDraftValues = () => {
  for (const key of Object.keys(draftValues)) {
    delete draftValues[key]
  }
  for (const row of versionDetail.data_rows) {
    draftValues[buildCellKey(row.sku_code, row.plan_week)] =
      row.plan_value === null || row.plan_value === undefined || row.plan_value === ''
        ? undefined
        : Number(row.plan_value)
  }
}

const weekColumns = computed(() => versionDetail.weeks || [])

const detailRows = computed(() => {
  const rowMap = new Map<string, any>()
  for (const row of versionDetail.data_rows) {
    const key = row.sku_code
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        sku_code: row.sku_code,
        sku_name: row.sku_name,
        category_name: row.lv3_category_name || '',
        cells: {}
      })
    }
    rowMap.get(key).cells[row.plan_week] = row
  }
  return [...rowMap.values()]
})

const currentChannelStatus = computed(() =>
  versionDetail.channel_statuses.find((row) => row.lv2_channel_code === versionDetail.selected_channel_code) || null
)

const canEditCurrentChannel = computed(() => {
  if (!versionDetail.version) return false
  if (String(versionDetail.version.status) === '3') return false
  if (String(currentChannelStatus.value?.submit_status || 0) === '1') return false
  return true
})

const fetchOptions = async () => {
  const res = await axios.get('/demand/channel-plan/options')
  const data = res.data?.data || {}
  options.channels = data.channels || []
  options.skus = data.skus || []
  options.categories = data.categories || []
}

const fetchPlans = async () => {
  loading.value = true
  try {
    const res = await axios.get('/demand/channel-plan', {
      params: {
        ...planQuery,
        page: page.value,
        pageSize: pageSize.value
      }
    })
    planRows.value = res.data?.data?.list || []
    total.value = res.data?.data?.total || 0
  } finally {
    loading.value = false
  }
}

const fetchLockRules = async () => {
  lockRuleLoading.value = true
  try {
    const res = await axios.get('/demand/channel-plan/product-lock-rules', {
      params: { ...lockRuleQuery }
    })
    lockRules.value = res.data?.data || []
  } finally {
    lockRuleLoading.value = false
  }
}

const openVersions = async (row: any) => {
  activePlan.value = row
  versionDrawerVisible.value = true
  versionLoading.value = true
  try {
    const res = await axios.get(`/demand/channel-plan/${row.plan_code}/version`)
    versionRows.value = res.data?.data || []
  } finally {
    versionLoading.value = false
  }
  // Fetch submission lookup for confirmed versions
  fetchSubmissionLookup()
}

const fetchSubmissionLookup = async () => {
  const confirmedCodes = versionRows.value
    .filter((v: any) => String(v.status) === '3')
    .map((v: any) => v.version_code)
  if (confirmedCodes.length === 0) {
    submissionLookup.value = {}
    return
  }
  submissionLookupLoading.value = true
  try {
    const res = await axios.get('/demand/channel-submission/lookup-by-versions', {
      params: { version_codes: confirmedCodes.join(',') }
    })
    submissionLookup.value = res.data?.data || {}
  } catch {
    submissionLookup.value = {}
  } finally {
    submissionLookupLoading.value = false
  }
}

const goToSubmission = (versionCode: string, openExisting = true) => {
  const sub = submissionLookup.value[versionCode]
  if (openExisting && sub?.submission_no) {
    router.push({
      path: '/demand/channel-submission',
      query: { submission_no: sub.submission_no }
    })
    return
  }

  router.push({
    path: '/demand/channel-submission',
    query: { version_code: versionCode }
  })
}

// Roll version
const handleRollVersion = async (plan: any) => {
  try {
    await ElMessageBox.confirm('将基于最新已确认版本自动滚动生成新版本，确定继续？', '滚动更新', { type: 'info' })
  } catch { return }
  rollingVersion.value = true
  try {
    const { data } = await axios.post(`/demand/channel-plan/${plan.plan_code}/version/roll`)
    if (data.code === 200) {
      ElMessage.success(`滚动生成成功，新版本: ${data.data.version_code}`)
      // Refresh version list
      if (activePlan.value) {
        versionLoading.value = true
        const res = await axios.get(`/demand/channel-plan/${activePlan.value.plan_code}/version`)
        versionRows.value = res.data?.data || []
        versionLoading.value = false
        fetchSubmissionLookup()
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '滚动失败')
  } finally { rollingVersion.value = false }
}

const openVersionDetail = async (row: any, channelCode = '') => {
  detailLoading.value = true
  versionDetailVisible.value = true
  try {
    const res = await axios.get(`/demand/channel-plan/version/${row.version_code}/data`, {
      params: channelCode ? { channelCode } : {}
    })
    const data = res.data?.data || {}
    versionDetail.plan = data.plan || null
    versionDetail.version = data.version || null
    versionDetail.weeks = data.weeks || []
    versionDetail.channel_statuses = data.channel_statuses || []
    versionDetail.selected_channel_code = data.selected_channel_code || ''
    versionDetail.selected_channel_name = data.selected_channel_name || ''
    versionDetail.data_rows = data.data_rows || []
    versionDetail.lock_summary = data.lock_summary || { locked_count: 0, editable_count: 0 }
    hydrateDraftValues()
  } finally {
    detailLoading.value = false
  }
}

const openPlanDialog = () => {
  resetPlanForm()
  planDialogVisible.value = true
}

const openVersionDialog = async (row?: any) => {
  if (row) {
    activePlan.value = row
    versionLoading.value = true
    try {
      const res = await axios.get(`/demand/channel-plan/${row.plan_code}/version`)
      versionRows.value = res.data?.data || []
    } finally {
      versionLoading.value = false
    }
  }
  if (!activePlan.value) {
    ElMessage.warning('请先选择计划')
    return
  }
  resetVersionForm()
  versionDialogVisible.value = true
}

const openRollDialog = async (row?: any) => {
  if (row) {
    activePlan.value = row
    await openVersions(row)
  }
  if (!activePlan.value) {
    ElMessage.warning('请先选择计划')
    return
  }
  if (versionRows.value.length < 1) {
    ElMessage.warning('当前计划还没有版本，无法滚动生成')
    return
  }
  resetRollForm()
  rollDialogVisible.value = true
}

const openCompareDialog = async (row?: any) => {
  if (row) {
    activePlan.value = row
    await openVersions(row)
  }
  if (!activePlan.value) {
    ElMessage.warning('请先选择计划')
    return
  }
  if (versionRows.value.length < 2) {
    ElMessage.warning('当前计划至少需要两个版本才能对比')
    return
  }
  resetCompareForm()
  compareDialogVisible.value = true
}

const openLockRuleDrawer = async () => {
  lockRuleDrawerVisible.value = true
  await fetchLockRules()
}

const openLockRuleCreate = () => {
  resetLockRuleForm()
  lockRuleDialogVisible.value = true
}

const openLockRuleEdit = (row: any) => {
  editingLockRuleId.value = Number(row.id)
  Object.assign(lockRuleForm, {
    sku_code: row.sku_code || '',
    channel_codes: [...(row.channel_codes || [])],
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    remark: row.remark || ''
  })
  lockRuleDialogVisible.value = true
}

const savePlan = async () => {
  planSaving.value = true
  try {
    await axios.post('/demand/channel-plan', {
      ...planForm,
      channel_codes: planForm.channel_scope === 2 ? planForm.channel_codes : [],
      sku_codes: planForm.sku_scope === 2 ? planForm.sku_codes : []
    })
    ElMessage.success('计划创建成功')
    planDialogVisible.value = false
    await fetchPlans()
  } finally {
    planSaving.value = false
  }
}

const saveVersion = async () => {
  if (!activePlan.value?.plan_code) {
    ElMessage.warning('请先选择计划')
    return
  }
  versionSaving.value = true
  try {
    await axios.post(`/demand/channel-plan/${activePlan.value.plan_code}/version`, versionForm)
    ElMessage.success('版本创建成功')
    versionDialogVisible.value = false
    await openVersions(activePlan.value)
    await fetchPlans()
  } finally {
    versionSaving.value = false
  }
}

const saveRollVersion = async () => {
  if (!activePlan.value?.plan_code) {
    ElMessage.warning('请先选择计划')
    return
  }
  rollingVersion.value = true
  try {
    await axios.post(`/demand/channel-plan/${activePlan.value.plan_code}/version/roll`, rollForm)
    ElMessage.success('滚动版本生成成功')
    rollDialogVisible.value = false
    await Promise.all([
      openVersions(activePlan.value),
      fetchPlans()
    ])
  } finally {
    rollingVersion.value = false
  }
}

const runVersionCompare = async () => {
  if (!compareForm.source_version_code || !compareForm.target_version_code) {
    ElMessage.warning('请选择要对比的两个版本')
    return
  }
  if (compareForm.source_version_code === compareForm.target_version_code) {
    ElMessage.warning('对比源版本和目标版本不能相同')
    return
  }
  compareLoading.value = true
  try {
    const res = await axios.get(`/demand/channel-plan/version/${compareForm.source_version_code}/compare`, {
      params: {
        targetVersionCode: compareForm.target_version_code,
        onlyChanged: compareForm.only_changed ? 1 : 0
      }
    })
    const data = res.data?.data || {}
    compareResult.source_version = data.source_version || null
    compareResult.target_version = data.target_version || null
    compareResult.summary = data.summary || {}
    compareResult.rows = data.rows || []
    compareResult.channel_groups = data.channel_groups || []
    compareActiveChannels.value = (data.channel_groups || [])
      .filter((g: any) => g.changed_cells > 0)
      .map((g: any) => g.lv2_channel_code)
  } finally {
    compareLoading.value = false
  }
}

const saveLockRule = async () => {
  lockRuleSaving.value = true
  try {
    const payload = {
      sku_code: lockRuleForm.sku_code,
      channel_codes: lockRuleForm.channel_codes,
      start_date: lockRuleForm.start_date,
      end_date: lockRuleForm.end_date,
      remark: lockRuleForm.remark
    }
    if (editingLockRuleId.value) {
      await axios.put(`/demand/channel-plan/product-lock-rules/${editingLockRuleId.value}`, payload)
    } else {
      await axios.post('/demand/channel-plan/product-lock-rules', payload)
    }
    ElMessage.success('锁定规则保存成功')
    lockRuleDialogVisible.value = false
    await fetchLockRules()
    if (versionDetail.version?.version_code) {
      await openVersionDetail(versionDetail.version, versionDetail.selected_channel_code)
    }
  } finally {
    lockRuleSaving.value = false
  }
}

const removeLockRule = async (row: any) => {
  await ElMessageBox.confirm(`确认删除锁定规则 ${row.sku_name} 吗？`, '删除确认', { type: 'warning' })
  await axios.delete(`/demand/channel-plan/product-lock-rules/${row.id}`)
  ElMessage.success('锁定规则删除成功')
  await fetchLockRules()
}

const exportVersion = async (row: any) => {
  if (!row?.version_code) return
  exportingVersionCode.value = row.version_code
  try {
    const res = await axios.get(`/demand/channel-plan/version/${row.version_code}/export`, {
      responseType: 'blob'
    })
    const disposition = String(res.headers['content-disposition'] || '')
    const matched = disposition.match(/filename\*=UTF-8''([^;]+)/)
    const filename = matched?.[1] ? decodeURIComponent(matched[1]) : `${row.version_code}.xlsx`
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('版本导出成功')
  } finally {
    exportingVersionCode.value = ''
  }
}

const canEditCell = (cell: any) => {
  if (!canEditCurrentChannel.value) return false
  if (Number(cell?.is_locked || 0) !== 1) return true
  return isSuperAdmin.value
}

const saveVersionData = async () => {
  if (!versionDetail.version?.version_code || !versionDetail.selected_channel_code) return

  const changedEntries = versionDetail.data_rows
    .map((row: any) => {
      const key = buildCellKey(row.sku_code, row.plan_week)
      const nextValue = draftValues[key]
      const normalizedCurrent = row.plan_value === null || row.plan_value === undefined || row.plan_value === '' ? undefined : Number(row.plan_value)
      const normalizedNext = nextValue === null || nextValue === undefined ? undefined : Number(nextValue)
      if (normalizedCurrent === normalizedNext) return null
      return {
        id: row.id,
        sku_code: row.sku_code,
        plan_week: row.plan_week,
        plan_value: normalizedNext === undefined ? null : normalizedNext,
        is_locked: Number(row.is_locked || 0) === 1
      }
    })
    .filter(Boolean) as Array<{ id: number, sku_code: string, plan_week: string, plan_value: number | null, is_locked: boolean }>

  if (!changedEntries.length) {
    ElMessage.info('当前渠道没有变更需要保存')
    return
  }

  let forceEdit = false
  let forceReason = ''
  const lockedEntries = changedEntries.filter((item) => item.is_locked)
  if (lockedEntries.length) {
    if (!isSuperAdmin.value) {
      ElMessage.warning('普通用户不能修改锁定格')
      return
    }
    const promptResult = await ElMessageBox.prompt(
      `本次有 ${lockedEntries.length} 个锁定格需要强制修改，请填写原因。`,
      '强制修改锁定格',
      {
        inputType: 'textarea',
        inputPlaceholder: '请输入业务原因',
        inputPattern: /\S+/,
        inputErrorMessage: '原因不能为空'
      }
    )
    forceEdit = true
    forceReason = promptResult.value
  }

  detailLoading.value = true
  try {
    await axios.put(`/demand/channel-plan/version/${versionDetail.version.version_code}/data`, {
      channel_code: versionDetail.selected_channel_code,
      entries: changedEntries.map(({ is_locked, ...rest }) => rest),
      force_edit: forceEdit,
      force_reason: forceReason
    })
    ElMessage.success('渠道数据保存成功')
    await Promise.all([
      openVersionDetail(versionDetail.version, versionDetail.selected_channel_code),
      activePlan.value ? openVersions(activePlan.value) : Promise.resolve(),
      fetchPlans()
    ])
  } finally {
    detailLoading.value = false
  }
}

const rebuildCurrentVersionLocks = async () => {
  if (!versionDetail.version?.version_code) return
  rebuildLocking.value = true
  try {
    await axios.post(`/demand/channel-plan/version/${versionDetail.version.version_code}/rebuild-locks`)
    ElMessage.success('锁定快照已刷新')
    await Promise.all([
      openVersionDetail(versionDetail.version, versionDetail.selected_channel_code),
      activePlan.value ? openVersions(activePlan.value) : Promise.resolve()
    ])
  } finally {
    rebuildLocking.value = false
  }
}

const submitCurrentChannel = async (allowEmpty = false) => {
  if (!versionDetail.version?.version_code || !versionDetail.selected_channel_code) return
  detailLoading.value = true
  try {
    await axios.post(`/demand/channel-plan/version/${versionDetail.version.version_code}/channel/${versionDetail.selected_channel_code}/submit`, {
      allowEmpty
    })
    ElMessage.success('渠道提交成功')
    await Promise.all([
      openVersionDetail(versionDetail.version, versionDetail.selected_channel_code),
      activePlan.value ? openVersions(activePlan.value) : Promise.resolve(),
      fetchPlans()
    ])
  } catch (error: any) {
    const emptyCount = error?.response?.data?.details?.empty_count
    if (!allowEmpty && emptyCount) {
      await ElMessageBox.confirm(
        `当前渠道仍有 ${emptyCount} 个空白单元格，继续提交会保留空值。是否继续？`,
        '提交确认',
        { type: 'warning' }
      )
      await submitCurrentChannel(true)
      return
    }
    throw error
  } finally {
    detailLoading.value = false
  }
}

const withdrawCurrentChannel = async () => {
  if (!versionDetail.version?.version_code || !versionDetail.selected_channel_code) return
  await ElMessageBox.confirm('撤回后该渠道会恢复可编辑状态，是否继续？', '撤回确认', { type: 'warning' })
  detailLoading.value = true
  try {
    await axios.post(`/demand/channel-plan/version/${versionDetail.version.version_code}/channel/${versionDetail.selected_channel_code}/withdraw`)
    ElMessage.success('撤回成功')
    await Promise.all([
      openVersionDetail(versionDetail.version, versionDetail.selected_channel_code),
      activePlan.value ? openVersions(activePlan.value) : Promise.resolve(),
      fetchPlans()
    ])
  } finally {
    detailLoading.value = false
  }
}

const confirmVersion = async (row?: any) => {
  const targetVersion = row?.version_code ? row : versionDetail.version
  if (!targetVersion?.version_code) return
  await ElMessageBox.confirm('整体确认后版本将冻结，不再允许修改，是否继续？', '整体确认', { type: 'warning' })
  versionLoading.value = true
  try {
    await axios.post(`/demand/channel-plan/version/${targetVersion.version_code}/confirm`)
    ElMessage.success('整体确认成功')
    if (versionDetailVisible.value && versionDetail.version?.version_code === targetVersion.version_code) {
      await openVersionDetail(targetVersion, versionDetail.selected_channel_code)
    }
    await Promise.all([
      activePlan.value ? openVersions(activePlan.value) : Promise.resolve(),
      fetchPlans()
    ])
  } finally {
    versionLoading.value = false
  }
}

onMounted(async () => {
  await appStore.fetchAccessContext().catch(() => undefined)
  await fetchOptions()
  await fetchPlans()
})
</script>

<template>
  <div class="channel-demand-plan-page">
    <div class="toolbar">
      <el-input v-model="planQuery.keyword" placeholder="计划名称/计划编码" clearable style="width: 260px" />
      <el-select v-model="planQuery.status" clearable placeholder="状态" style="width: 140px">
        <el-option label="草稿" value="0" />
        <el-option label="提交中" value="1" />
        <el-option label="待确认" value="2" />
        <el-option label="已确认" value="3" />
      </el-select>
      <el-select v-model="planQuery.planType" clearable placeholder="计划类型" style="width: 140px">
        <el-option label="周度" value="1" />
        <el-option label="月度" value="2" />
      </el-select>
      <el-select v-model="planQuery.createType" clearable placeholder="创建方式" style="width: 140px">
        <el-option label="手动" value="1" />
        <el-option label="滚动自动" value="2" />
      </el-select>
      <el-button type="primary" @click="page = 1; fetchPlans()">查询</el-button>
      <el-button @click="openPlanDialog">新建计划</el-button>
      <el-button v-if="isSuperAdmin" type="warning" @click="openLockRuleDrawer">产品锁定期</el-button>
    </div>

    <el-alert
      title="当前工作台已支持计划与版本管理、版本明细编辑、渠道提交、整体确认，以及产品锁定期规则维护。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <el-table :data="planRows" v-loading="loading" border stripe>
      <el-table-column prop="plan_code" label="计划编码" width="180" />
      <el-table-column prop="plan_name" label="计划名称" min-width="220" />
      <el-table-column prop="plan_type" label="计划类型" width="100">
        <template #default="{ row }">{{ String(row.plan_type) === '2' ? '月度' : '周度' }}</template>
      </el-table-column>
      <el-table-column prop="create_type" label="创建方式" width="100">
        <template #default="{ row }">{{ createTypeText(row.create_type) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="计划状态" width="100">
        <template #default="{ row }">{{ statusText(row.status) }}</template>
      </el-table-column>
      <el-table-column label="覆盖" width="100">
        <template #default="{ row }">{{ row.week_count }}{{ String(row.plan_type) === '2' ? '个月' : '周' }}</template>
      </el-table-column>
      <el-table-column prop="version_count" label="版本数" width="90" />
      <el-table-column prop="latest_version_code" label="最新版本" width="220" />
      <el-table-column prop="channel_count" label="渠道数" width="90" />
      <el-table-column prop="sku_count" label="SKU数" width="90" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openVersions(row)">版本</el-button>
          <el-button link type="success" @click="openVersionDialog(row)">新建版本</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @current-change="fetchPlans"
        @size-change="page = 1; fetchPlans()"
      />
    </div>

    <el-drawer v-model="versionDrawerVisible" :title="activePlan ? `${activePlan.plan_name} - 版本列表` : '版本列表'" size="900px">
      <div class="toolbar">
        <el-button type="primary" @click="openVersionDialog()">新建版本</el-button>
        <el-button @click="openRollDialog()">滚动生成版本</el-button>
        <el-button @click="openCompareDialog()">版本对比</el-button>
        <el-button type="warning" :loading="rollingVersion" @click="handleRollVersion(activePlan)">滚动更新</el-button>
      </div>
      <el-table :data="versionRows" v-loading="versionLoading" border stripe>
        <el-table-column prop="version_code" label="版本号" width="240" />
        <el-table-column prop="version_label" label="版本名称" min-width="160" />
        <el-table-column prop="begin_week" width="110">
          <template #header><span>{{ activePlan?.plan_type === 2 ? '开始月' : '开始周' }}</span></template>
        </el-table-column>
        <el-table-column prop="end_week" width="110">
          <template #header><span>{{ activePlan?.plan_type === 2 ? '结束月' : '结束周' }}</span></template>
        </el-table-column>
        <el-table-column prop="week_count" width="80">
          <template #header><span>{{ activePlan?.plan_type === 2 ? '月数' : '周数' }}</span></template>
        </el-table-column>
        <el-table-column prop="submitted_count" label="已提交渠道" width="110" />
        <el-table-column prop="channel_total" label="渠道总数" width="100" />
        <el-table-column prop="locked_cell_count" label="锁定格数" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">{{ statusText(row.status) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="400" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openVersionDetail(row)">编辑</el-button>
            <el-button
              v-if="String(row.status) === '3'"
              link
              type="warning"
              :loading="exportingVersionCode === row.version_code"
              @click="exportVersion(row)"
            >
              导出
            </el-button>
            <el-button
              v-if="isSuperAdmin && String(row.status) !== '3'"
              link
              type="success"
              @click="confirmVersion(row)"
            >
              整体确认
            </el-button>
            <template v-if="String(row.status) === '3'">
              <el-button
                v-if="submissionLookup[row.version_code]"
                link
                type="primary"
                @click="goToSubmission(row.version_code)"
              >
                查看提报
              </el-button>
              <el-button
                v-else
                link
                type="primary"
                @click="goToSubmission(row.version_code)"
              >
                新建提报
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <el-drawer
      v-model="versionDetailVisible"
      :title="versionDetail.version ? `${versionDetail.version.version_label || versionDetail.version.version_code} - 版本编辑` : '版本编辑'"
      size="92%"
    >
      <div class="toolbar detail-toolbar">
        <el-select
          v-model="versionDetail.selected_channel_code"
          placeholder="选择渠道"
          style="width: 320px"
          @change="(value: string) => openVersionDetail(versionDetail.version, value)"
        >
          <el-option
            v-for="row in versionDetail.channel_statuses"
            :key="row.lv2_channel_code"
            :label="`${row.lv2_channel_name} (${Number(row.submit_status) === 1 ? '已提交' : '未提交'})`"
            :value="row.lv2_channel_code"
          />
        </el-select>
        <el-tag type="info">版本状态：{{ statusText(versionDetail.version?.status) }}</el-tag>
        <el-tag type="warning">锁定格：{{ versionDetail.lock_summary.locked_count }}</el-tag>
        <el-tag :type="String(currentChannelStatus?.submit_status || 0) === '1' ? 'success' : 'warning'">
          {{ String(currentChannelStatus?.submit_status || 0) === '1' ? '渠道已提交' : '渠道未提交' }}
        </el-tag>
        <el-button type="primary" :disabled="!canEditCurrentChannel" @click="saveVersionData">保存渠道</el-button>
        <el-button type="success" :disabled="String(currentChannelStatus?.submit_status || 0) === '1'" @click="submitCurrentChannel()">提交渠道</el-button>
        <el-button
          v-if="isSuperAdmin"
          type="warning"
          :disabled="String(currentChannelStatus?.submit_status || 0) !== '1' || String(versionDetail.version?.status) === '3'"
          @click="withdrawCurrentChannel"
        >
          撤回渠道
        </el-button>
        <el-button
          v-if="isSuperAdmin"
          :loading="rebuildLocking"
          :disabled="String(versionDetail.version?.status) === '3'"
          @click="rebuildCurrentVersionLocks"
        >
          刷新锁定
        </el-button>
        <el-button
          v-if="isSuperAdmin"
          type="danger"
          :disabled="String(versionDetail.version?.status) === '3'"
          @click="confirmVersion()"
        >
          整体确认
        </el-button>
      </div>

      <el-alert
        title="普通用户不能编辑锁定格；超级管理员可以强制修改，但保存时必须填写原因。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />

      <el-table :data="detailRows" v-loading="detailLoading" border stripe height="calc(100vh - 240px)">
        <el-table-column prop="category_name" label="三级品类" width="160" />
        <el-table-column prop="sku_name" label="SKU" min-width="260" />
        <el-table-column prop="sku_code" label="SKU编码" width="180" />
        <el-table-column
          v-for="week in weekColumns"
          :key="week.plan_week"
          :label="week.plan_week"
          min-width="148"
          align="center"
        >
          <template #header>
            <div class="week-header">
              <span>{{ week.plan_week }}</span>
              <small>{{ week.week_start_date }} ~ {{ week.week_end_date }}</small>
            </div>
          </template>
          <template #default="{ row }">
            <div
              class="week-cell"
              :class="{ locked: Number(row.cells?.[week.plan_week]?.is_locked || 0) === 1 }"
              :title="row.cells?.[week.plan_week]?.lock_reason || ''"
            >
              <el-input-number
                v-model="draftValues[buildCellKey(row.sku_code, week.plan_week)]"
                :min="0"
                :precision="0"
                controls-position="right"
                style="width: 112px"
                :disabled="!canEditCell(row.cells?.[week.plan_week])"
              />
              <small v-if="Number(row.cells?.[week.plan_week]?.is_locked || 0) === 1" class="cell-tip">
                锁定
              </small>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <el-drawer v-model="lockRuleDrawerVisible" title="产品锁定期" size="860px">
      <div class="toolbar">
        <el-input v-model="lockRuleQuery.keyword" placeholder="SKU/渠道" clearable style="width: 240px" />
        <el-select v-model="lockRuleQuery.lifecycleStatus" clearable placeholder="生效状态" style="width: 140px">
          <el-option label="未生效" value="FUTURE" />
          <el-option label="生效中" value="ACTIVE" />
          <el-option label="已过期" value="EXPIRED" />
        </el-select>
        <el-button type="primary" @click="fetchLockRules()">查询</el-button>
        <el-button type="success" @click="openLockRuleCreate">新建规则</el-button>
      </div>

      <el-alert
        title="锁定规则按 SKU + 二级渠道 + 日期范围生效。当前日期已过结束日期的规则只读，未生效规则允许删除。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />

      <el-table :data="lockRules" v-loading="lockRuleLoading" border stripe>
        <el-table-column prop="sku_name" label="SKU" min-width="220" />
        <el-table-column prop="sku_code" label="SKU编码" width="220" />
        <el-table-column label="锁定渠道" min-width="220">
          <template #default="{ row }">{{ (row.channel_names || []).join('、') }}</template>
        </el-table-column>
        <el-table-column prop="start_date" label="开始日期" width="110" />
        <el-table-column prop="end_date" label="结束日期" width="110" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="lifecycleTagType(row.lifecycle_status)">{{ row.lifecycle_label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="row.lifecycle_status === 'EXPIRED'" @click="openLockRuleEdit(row)">编辑</el-button>
            <el-button link type="danger" :disabled="row.lifecycle_status !== 'FUTURE'" @click="removeLockRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <el-dialog v-model="planDialogVisible" title="新建计划" width="760px">
      <el-form label-width="110px">
        <el-form-item label="计划名称">
          <el-input v-model="planForm.plan_name" placeholder="例如：华东渠道周需求计划" />
        </el-form-item>
        <div class="toolbar">
          <el-form-item label="计划类型">
            <el-select v-model="planForm.plan_type" style="width: 160px">
              <el-option label="周度" :value="1" />
              <el-option label="月度" :value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="创建方式">
            <el-select v-model="planForm.create_type" style="width: 160px">
              <el-option label="手动" :value="1" />
              <el-option label="滚动自动" :value="2" />
            </el-select>
          </el-form-item>
          <el-form-item :label="planForm.plan_type === 2 ? '覆盖月数' : '覆盖周数'">
            <el-input-number v-model="planForm.week_count" :min="1" :max="planForm.plan_type === 2 ? 12 : 26" style="width: 160px" />
          </el-form-item>
        </div>
        <div class="toolbar">
          <el-form-item label="渠道范围">
            <el-select v-model="planForm.channel_scope" style="width: 160px">
              <el-option label="全部渠道" :value="1" />
              <el-option label="指定渠道" :value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="SKU范围">
            <el-select v-model="planForm.sku_scope" style="width: 160px">
              <el-option label="全部SKU" :value="1" />
              <el-option label="指定SKU" :value="2" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item v-if="planForm.channel_scope === 2" label="指定渠道">
          <el-select v-model="planForm.channel_codes" multiple filterable collapse-tags style="width: 100%">
            <el-option v-for="row in options.channels" :key="row.channel_code" :label="row.channel_name" :value="row.channel_code" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="planForm.sku_scope === 2" label="指定SKU">
          <el-select v-model="planForm.sku_codes" multiple filterable collapse-tags style="width: 100%">
            <el-option v-for="row in options.skus" :key="row.sku_code" :label="`${row.sku_name} (${row.sku_code})`" :value="row.sku_code" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="planForm.remark" type="textarea" :rows="3" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="planSaving" @click="savePlan">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="versionDialogVisible" title="新建版本" width="680px">
      <el-form label-width="110px">
        <el-form-item label="所属计划">
          <el-input :model-value="activePlan?.plan_name || '-'" disabled />
        </el-form-item>
        <div class="toolbar">
          <el-form-item label="版本号">
            <el-input v-model="versionForm.version_code" placeholder="可空，系统自动生成" style="width: 240px" />
          </el-form-item>
          <el-form-item label="版本名称">
            <el-input v-model="versionForm.version_label" placeholder="可空，系统自动生成" style="width: 220px" />
          </el-form-item>
        </div>
        <div class="toolbar">
          <el-form-item :label="activePlan?.plan_type === 2 ? '开始月' : '开始周'">
            <el-input v-model="versionForm.begin_week" :placeholder="activePlan?.plan_type === 2 ? '例如 2026M01' : '例如 2026W18'" style="width: 180px" />
          </el-form-item>
          <el-form-item :label="activePlan?.plan_type === 2 ? '覆盖月数' : '覆盖周数'">
            <el-input-number v-model="versionForm.week_count" :min="1" :max="activePlan?.plan_type === 2 ? 12 : 26" style="width: 160px" />
          </el-form-item>
        </div>
        <el-form-item label="继承版本">
          <el-select v-model="versionForm.last_version_code" clearable placeholder="首版可不选" style="width: 100%">
            <el-option
              v-for="row in versionRows"
              :key="row.version_code"
              :label="`${row.version_label || row.version_code} (${row.version_code})`"
              :value="row.version_code"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="versionDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="versionSaving" @click="saveVersion">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rollDialogVisible" title="滚动生成版本" width="700px">
      <el-form label-width="110px">
        <el-form-item label="所属计划">
          <el-input :model-value="activePlan?.plan_name || '-'" disabled />
        </el-form-item>
        <el-form-item label="参考版本">
          <el-select v-model="rollForm.reference_version_code" placeholder="请选择参考版本" style="width: 100%">
            <el-option
              v-for="row in versionRows"
              :key="row.version_code"
              :label="`${row.version_label || row.version_code} (${row.version_code})`"
              :value="row.version_code"
            />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="rollReferenceVersion"
          :title="`参考版本 ${rollReferenceVersion.version_label || rollReferenceVersion.version_code} 结束${activePlan?.plan_type === 2 ? '月' : '周'}：${rollReferenceVersion.end_week}，滚动版本默认从下${activePlan?.plan_type === 2 ? '月' : '周'}开始`"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <div class="toolbar">
          <el-form-item :label="activePlan?.plan_type === 2 ? '开始月' : '开始周'">
            <el-input v-model="rollForm.begin_week" :placeholder="activePlan?.plan_type === 2 ? '可空，默认取参考版本结束月的下一月' : '可空，默认取参考版本结束周的下一周'" style="width: 260px" />
          </el-form-item>
          <el-form-item :label="activePlan?.plan_type === 2 ? '覆盖月数' : '覆盖周数'">
            <el-input-number v-model="rollForm.week_count" :min="1" :max="activePlan?.plan_type === 2 ? 12 : 26" style="width: 160px" />
          </el-form-item>
        </div>
        <el-form-item label="版本名称">
          <el-input v-model="rollForm.version_label" placeholder="可空，系统默认生成滚动版本名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rollDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="rollingVersion" @click="saveRollVersion">生成</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="compareDialogVisible" title="版本对比" width="1120px" top="6vh">
      <div class="toolbar" style="margin-bottom: 12px">
        <el-select v-model="compareForm.source_version_code" placeholder="对比源版本" style="width: 280px">
          <el-option
            v-for="row in versionRows"
            :key="row.version_code"
            :label="`${row.version_label || row.version_code} (${row.version_code})`"
            :value="row.version_code"
          />
        </el-select>
        <el-select v-model="compareForm.target_version_code" placeholder="目标版本" style="width: 280px">
          <el-option
            v-for="row in versionRows"
            :key="row.version_code"
            :label="`${row.version_label || row.version_code} (${row.version_code})`"
            :value="row.version_code"
          />
        </el-select>
        <el-checkbox v-model="compareForm.only_changed">只看差异</el-checkbox>
        <el-button type="primary" :loading="compareLoading" @click="runVersionCompare">开始对比</el-button>
      </div>

      <div v-if="compareResult.source_version && compareResult.target_version" class="compare-summary">
        <el-tag type="info">源版本：{{ compareResult.source_version.version_label || compareResult.source_version.version_code }}</el-tag>
        <el-tag type="success">目标版本：{{ compareResult.target_version.version_label || compareResult.target_version.version_code }}</el-tag>
        <el-tag type="warning">变更单元格：{{ compareResult.summary.changed_cells || 0 }}</el-tag>
        <el-tag>增加：{{ compareResult.summary.increased_cells || 0 }}</el-tag>
        <el-tag>减少：{{ compareResult.summary.decreased_cells || 0 }}</el-tag>
        <div class="compare-toggle-btns">
          <el-button link type="primary" size="small" @click="expandAllChannels">全部展开</el-button>
          <el-button link type="primary" size="small" @click="collapseAllChannels">全部收起</el-button>
        </div>
      </div>

      <div v-loading="compareLoading" class="compare-report-body">
        <el-empty v-if="!compareResult.channel_groups.length" description="无对比结果" />

        <el-collapse v-model="compareActiveChannels">
          <el-collapse-item
            v-for="group in compareResult.channel_groups"
            :key="group.lv2_channel_code"
            :name="group.lv2_channel_code"
          >
            <template #title>
              <div class="channel-collapse-title">
                <span class="channel-name">{{ group.lv2_channel_name }}</span>
                <span class="channel-stats">
                  <el-tag v-if="group.changed_cells > 0" size="small" type="warning">{{ group.changed_cells }} 处变更</el-tag>
                  <el-tag v-else size="small" type="info">无变更</el-tag>
                  <span v-if="group.total_delta !== 0" class="channel-net-delta" :class="group.total_delta > 0 ? 'delta-increase' : 'delta-decrease'">
                    净变化 {{ group.total_delta > 0 ? '+' : '' }}{{ group.total_delta }}
                  </span>
                  <span v-else class="channel-net-delta delta-zero">净变化 0</span>
                </span>
              </div>
            </template>

            <el-table :data="group.skus" border stripe size="small" class="sku-summary-table">
              <el-table-column type="expand">
                <template #default="{ row: skuRow }">
                  <div class="week-detail-panel">
                    <div class="week-detail-header">
                      <span>{{ skuRow.sku_name }} 周次明细</span>
                      <span class="week-detail-summary">
                        汇总：{{ formatCompareValue(skuRow.total_source) }} → {{ formatCompareValue(skuRow.total_target) }}
                        <span :class="skuRow.total_delta > 0 ? 'delta-increase' : skuRow.total_delta < 0 ? 'delta-decrease' : ''">
                          ({{ skuRow.total_delta > 0 ? '+' : '' }}{{ skuRow.total_delta }})
                        </span>
                      </span>
                    </div>
                    <el-table :data="skuRow.weeks" border stripe size="small">
                      <el-table-column prop="plan_week" label="周次" width="110" />
                      <el-table-column label="源版本值" width="120" align="right">
                        <template #default="{ row: weekRow }">{{ formatCompareValue(weekRow.source_value) }}</template>
                      </el-table-column>
                      <el-table-column label="目标版本值" width="120" align="right">
                        <template #default="{ row: weekRow }">{{ formatCompareValue(weekRow.target_value) }}</template>
                      </el-table-column>
                      <el-table-column label="差值" width="110" align="right">
                        <template #default="{ row: weekRow }">
                          <span :class="weekRow.delta_value > 0 ? 'delta-increase' : weekRow.delta_value < 0 ? 'delta-decrease' : ''">
                            {{ weekRow.delta_value > 0 ? '+' : '' }}{{ weekRow.delta_value !== 0 ? weekRow.delta_value : '-' }}
                          </span>
                        </template>
                      </el-table-column>
                      <el-table-column label="源锁定" width="80" align="center">
                        <template #default="{ row: weekRow }">
                          <el-tag v-if="weekRow.source_locked" size="small" type="danger">是</el-tag>
                          <span v-else class="text-muted">否</span>
                        </template>
                      </el-table-column>
                      <el-table-column label="目标锁定" width="80" align="center">
                        <template #default="{ row: weekRow }">
                          <el-tag v-if="weekRow.target_locked" size="small" type="danger">是</el-tag>
                          <span v-else class="text-muted">否</span>
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="lv3_category_name" label="三级品类" width="150" />
              <el-table-column prop="sku_name" label="SKU" min-width="200" show-overflow-tooltip />
              <el-table-column prop="sku_code" label="SKU编码" width="170" />
              <el-table-column label="源版本汇总" width="110" align="right">
                <template #default="{ row: skuRow }">{{ formatCompareValue(skuRow.total_source) }}</template>
              </el-table-column>
              <el-table-column label="目标版本汇总" width="110" align="right">
                <template #default="{ row: skuRow }">{{ formatCompareValue(skuRow.total_target) }}</template>
              </el-table-column>
              <el-table-column label="变化量" width="110" align="right">
                <template #default="{ row: skuRow }">
                  <span :class="skuRow.total_delta > 0 ? 'delta-increase' : skuRow.total_delta < 0 ? 'delta-decrease' : ''">
                    {{ skuRow.total_delta > 0 ? '+' : '' }}{{ skuRow.total_delta !== 0 ? skuRow.total_delta : '-' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="变更/总周数" width="110" align="center">
                <template #default="{ row: skuRow }">
                  <span :class="skuRow.changed_weeks > 0 ? 'text-warning' : 'text-muted'">
                    {{ skuRow.changed_weeks }} / {{ skuRow.total_weeks }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-collapse-item>
        </el-collapse>
      </div>

      <template #footer>
        <el-button @click="compareDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="lockRuleDialogVisible" :title="editingLockRuleId ? '编辑锁定规则' : '新建锁定规则'" width="720px">
      <el-form label-width="110px">
        <el-form-item label="SKU">
          <el-select v-model="lockRuleForm.sku_code" filterable placeholder="请选择SKU" style="width: 100%">
            <el-option
              v-for="row in options.skus"
              :key="row.sku_code"
              :label="`${row.sku_name} (${row.sku_code})`"
              :value="row.sku_code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="锁定渠道">
          <el-select v-model="lockRuleForm.channel_codes" multiple filterable collapse-tags placeholder="请选择二级渠道" style="width: 100%">
            <el-option v-for="row in options.channels" :key="row.channel_code" :label="row.channel_name" :value="row.channel_code" />
          </el-select>
        </el-form-item>
        <div class="toolbar">
          <el-form-item label="开始日期">
            <el-date-picker
              v-model="lockRuleForm.start_date"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 180px"
            />
          </el-form-item>
          <el-form-item label="结束日期">
            <el-date-picker
              v-model="lockRuleForm.end_date"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 180px"
            />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="lockRuleForm.remark" type="textarea" :rows="3" placeholder="例如：节庆档期价格冻结" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lockRuleDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="lockRuleSaving" @click="saveLockRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.channel-demand-plan-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.detail-toolbar {
  margin-bottom: 12px;
}

.compare-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}

.compare-toggle-btns {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

.compare-report-body {
  max-height: 56vh;
  overflow-y: auto;
}

.channel-collapse-title {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding-right: 16px;
}

.channel-collapse-title .channel-name {
  font-weight: 600;
  font-size: 15px;
  min-width: 140px;
}

.channel-collapse-title .channel-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.channel-net-delta {
  font-weight: 600;
  font-size: 13px;
}

.delta-increase {
  color: #67c23a;
  font-weight: 600;
}

.delta-decrease {
  color: #f56c6c;
  font-weight: 600;
}

.delta-zero {
  color: var(--el-text-color-secondary);
}

.text-muted {
  color: var(--el-text-color-secondary);
}

.text-warning {
  color: var(--el-color-warning);
  font-weight: 500;
}

.sku-summary-table {
  margin-bottom: 8px;
}

.week-detail-panel {
  padding: 12px 20px;
  background: var(--el-fill-color-lighter);
}

.week-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 14px;
}

.week-detail-summary {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.week-detail-summary .delta-increase,
.week-detail-summary .delta-decrease {
  font-weight: 600;
}

.pager {
  display: flex;
  justify-content: flex-end;
}

.week-header {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.week-header small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.week-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}

.week-cell.locked {
  background: rgba(245, 108, 108, 0.08);
  border-radius: 6px;
}

.cell-tip {
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1;
}
</style>
