<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const activeTab = ref('todo')
const lastRouteTaskKey = ref('')

const dashboard = reactive({
  todo_count: 0,
  done_count: 0,
  unread_message_count: 0,
  approval_pending_count: 0,
  task_failed_count: 0,
  overdue_count: 0
})

const todoQuery = reactive({ keyword: '', priority: '', bizType: '', overdue: '' })
const todoRows = ref<any[]>([])
const todoTotal = ref(0)
const todoPage = ref(1)
const todoPageSize = ref(10)

const doneQuery = reactive({ keyword: '', bizType: '' })
const doneRows = ref<any[]>([])
const doneTotal = ref(0)
const donePage = ref(1)
const donePageSize = ref(10)

const messageQuery = reactive({ keyword: '', status: '', category: '' })
const messageRows = ref<any[]>([])
const messageTotal = ref(0)
const messagePage = ref(1)
const messagePageSize = ref(10)
const messageSelection = ref<any[]>([])

const approvalQuery = reactive({ keyword: '', status: '', bizType: '' })
const approvalRows = ref<any[]>([])
const approvalTotal = ref(0)
const approvalPage = ref(1)
const approvalPageSize = ref(10)

const taskQuery = reactive({ keyword: '', status: '', taskType: '' })
const taskRows = ref<any[]>([])
const taskTotal = ref(0)
const taskPage = ref(1)
const taskPageSize = ref(10)

const ruleRows = ref<any[]>([])
const reminderRows = ref<any[]>([])

const approvalRecordDialogVisible = ref(false)
const approvalRecordRows = ref<any[]>([])
const approvalRecordTitle = ref('')

const taskLogDialogVisible = ref(false)
const taskLogRows = ref<any[]>([])
const taskLogTitle = ref('')

const summaryCards = computed(() => [
  { label: '我的待办', value: dashboard.todo_count, tab: 'todo' },
  { label: '我的已办', value: dashboard.done_count, tab: 'done' },
  { label: '未读消息', value: dashboard.unread_message_count, tab: 'message' },
  { label: '待审批', value: dashboard.approval_pending_count, tab: 'approval' },
  { label: '失败任务', value: dashboard.task_failed_count, tab: 'task' },
  { label: '超时事项', value: dashboard.overdue_count, tab: 'remind' }
])

const priorityTagType = (p: string) => {
  if (p === 'P0') return 'danger'
  if (p === 'P1') return 'warning'
  if (p === 'P2') return 'primary'
  return 'info'
}

const todoStatusTagType = (s: string) => {
  if (s === 'DONE') return 'success'
  if (s === 'PENDING') return 'warning'
  return 'info'
}

const fetchDashboard = async () => {
  const res = await axios.get('/workflow-center/dashboard')
  Object.assign(dashboard, res.data?.data || {})
}

const fetchTodos = async () => {
  const res = await axios.get('/workflow-center/todos', {
    params: {
      ...todoQuery,
      page: todoPage.value,
      pageSize: todoPageSize.value
    }
  })
  todoRows.value = res.data?.data?.list || []
  todoTotal.value = Number(res.data?.data?.total || 0)
}

const fetchDones = async () => {
  const res = await axios.get('/workflow-center/dones', {
    params: {
      ...doneQuery,
      page: donePage.value,
      pageSize: donePageSize.value
    }
  })
  doneRows.value = res.data?.data?.list || []
  doneTotal.value = Number(res.data?.data?.total || 0)
}

const fetchMessages = async () => {
  const res = await axios.get('/workflow-center/messages', {
    params: {
      ...messageQuery,
      page: messagePage.value,
      pageSize: messagePageSize.value
    }
  })
  messageRows.value = res.data?.data?.list || []
  messageTotal.value = Number(res.data?.data?.total || 0)
}

const fetchApprovals = async () => {
  const res = await axios.get('/workflow-center/approvals', {
    params: {
      ...approvalQuery,
      page: approvalPage.value,
      pageSize: approvalPageSize.value
    }
  })
  approvalRows.value = res.data?.data?.list || []
  approvalTotal.value = Number(res.data?.data?.total || 0)
}

const fetchTasks = async () => {
  const res = await axios.get('/workflow-center/tasks', {
    params: {
      ...taskQuery,
      page: taskPage.value,
      pageSize: taskPageSize.value
    }
  })
  taskRows.value = res.data?.data?.list || []
  taskTotal.value = Number(res.data?.data?.total || 0)
}

const fetchRules = async () => {
  const res = await axios.get('/workflow-center/timeout-rules')
  ruleRows.value = Array.isArray(res.data?.data) ? res.data.data : []
}

const fetchReminders = async () => {
  const res = await axios.get('/workflow-center/reminders', { params: { page: 1, pageSize: 40 } })
  reminderRows.value = res.data?.data?.list || []
}

const loadAll = async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchDashboard(),
      fetchTodos(),
      fetchDones(),
      fetchMessages(),
      fetchApprovals(),
      fetchTasks(),
      fetchRules(),
      fetchReminders()
    ])
  } catch {
    ElMessage.error('流程中心数据加载失败')
  } finally {
    loading.value = false
  }
}

const WORKFLOW_TAB_NAMES = new Set(['todo', 'done', 'message', 'approval', 'task', 'remind'])

const applyRouteQuery = async () => {
  const tab = String(route.query.tab || '').trim()
  if (WORKFLOW_TAB_NAMES.has(tab)) {
    activeTab.value = tab
  }

  const taskKey = String(route.query.taskKey || '').trim()
  if (!taskKey || taskKey === lastRouteTaskKey.value) return
  lastRouteTaskKey.value = taskKey
  activeTab.value = 'task'
  try {
    const res = await axios.get(`/workflow-center/tasks/${encodeURIComponent(taskKey)}`)
    const taskRow = res.data?.data
    if (taskRow?.task_key) {
      await viewTaskLogs(taskRow)
    }
  } catch {
    ElMessage.warning('任务不存在或无权限查看')
  }
}

const jumpBiz = (row: any) => {
  const path = String(row?.source_path || row?.link_path || '/workflow-center')
  if (!path.startsWith('/')) return
  router.push(path)
}

const completeTodo = async (row: any) => {
  const { value } = await ElMessageBox.prompt('请输入处理结论', '完成待办', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: '已处理'
  })
  await axios.post(`/workflow-center/todos/${row.id}/done`, { comment: value || '' })
  ElMessage.success('待办已完成')
  await Promise.all([fetchDashboard(), fetchTodos(), fetchDones()])
}

const remindTodo = async (row: any) => {
  const { value } = await ElMessageBox.prompt('请输入催办说明', '催办待办', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: '请尽快处理'
  })
  await axios.post(`/workflow-center/todos/${row.id}/remind`, { comment: value || '' })
  ElMessage.success('催办成功')
  await Promise.all([fetchTodos(), fetchReminders(), fetchDashboard()])
}

const handleMessageSelectionChange = (rows: any[]) => {
  messageSelection.value = rows
}

const markMessageRead = async (row: any) => {
  await axios.patch(`/workflow-center/messages/${row.id}/read`)
  await Promise.all([fetchMessages(), fetchDashboard()])
}

const batchReadMessages = async () => {
  if (!messageSelection.value.length) {
    ElMessage.warning('请先选择消息')
    return
  }
  await axios.patch('/workflow-center/messages/read-batch', {
    ids: messageSelection.value.map((item) => item.id)
  })
  ElMessage.success('批量已读成功')
  messageSelection.value = []
  await Promise.all([fetchMessages(), fetchDashboard()])
}

const viewApprovalRecords = async (row: any) => {
  const res = await axios.get(`/workflow-center/approvals/${row.id}/records`)
  approvalRecordRows.value = Array.isArray(res.data?.data) ? res.data.data : []
  approvalRecordTitle.value = `${row.title} 审批记录`
  approvalRecordDialogVisible.value = true
}

const doApproval = async (row: any, action: 'APPROVE' | 'REJECT') => {
  const { value } = await ElMessageBox.prompt('请输入审批意见', action === 'APPROVE' ? '审批通过' : '审批驳回', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: action === 'APPROVE' ? '同意' : '不通过'
  })
  await axios.post(`/workflow-center/approvals/${row.id}/action`, {
    action,
    comment: value || ''
  })
  ElMessage.success('审批完成')
  await Promise.all([fetchApprovals(), fetchDashboard(), fetchTodos(), fetchDones(), fetchMessages()])
}

const viewTaskLogs = async (row: any) => {
  const res = await axios.get(`/workflow-center/tasks/${row.task_key}/logs`)
  taskLogRows.value = Array.isArray(res.data?.data) ? res.data.data : []
  taskLogTitle.value = `${row.task_name} 日志`
  taskLogDialogVisible.value = true
}

const retryTask = async (row: any) => {
  await ElMessageBox.confirm(`确认重试任务 ${row.task_name} 吗？`, '重试任务', { type: 'warning' })
  await axios.post(`/workflow-center/tasks/${row.task_key}/retry`)
  ElMessage.success('任务已重试')
  await Promise.all([fetchTasks(), fetchDashboard(), fetchTodos(), fetchDones(), fetchMessages()])
}

const saveRule = async (row: any) => {
  await axios.put(`/workflow-center/timeout-rules/${row.id}`, {
    timeout_hours: row.timeout_hours,
    escalate_hours: row.escalate_hours,
    escalate_to: row.escalate_to,
    enabled: row.enabled
  })
  ElMessage.success('规则已更新')
  await fetchRules()
}

onMounted(async () => {
  await loadAll()
  await applyRouteQuery()
})

watch(
  () => [route.query.tab, route.query.taskKey],
  () => {
    void applyRouteQuery()
  }
)
</script>

<template>
  <div class="workflow-page" v-loading="loading">
    <div class="page-head">
      <div>
        <h2>流程协同与待办中心</h2>
        <p>统一承接待办、消息、审批、任务、催办与超时升级</p>
      </div>
      <el-button @click="loadAll">刷新</el-button>
    </div>

    <div class="summary-grid">
      <div v-for="item in summaryCards" :key="item.label" class="summary-card" @click="activeTab = item.tab">
        <div class="summary-label">{{ item.label }}</div>
        <div class="summary-value">{{ item.value }}</div>
      </div>
    </div>

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="我的待办" name="todo">
          <div class="toolbar">
            <el-input v-model="todoQuery.keyword" clearable placeholder="关键词" style="width: 220px" />
            <el-select v-model="todoQuery.priority" clearable placeholder="优先级" style="width: 140px">
              <el-option label="P0" value="P0" />
              <el-option label="P1" value="P1" />
              <el-option label="P2" value="P2" />
              <el-option label="P3" value="P3" />
            </el-select>
            <el-select v-model="todoQuery.bizType" clearable placeholder="业务类型" style="width: 150px">
              <el-option label="订单" value="ORDER" />
              <el-option label="主数据" value="MDM" />
              <el-option label="调拨" value="TRANSFER" />
              <el-option label="任务" value="TASK" />
              <el-option label="异常" value="EXCEPTION" />
            </el-select>
            <el-select v-model="todoQuery.overdue" clearable placeholder="超时筛选" style="width: 140px">
              <el-option label="仅超时" value="1" />
            </el-select>
            <el-button type="primary" @click="fetchTodos">查询</el-button>
          </div>
          <el-table :data="todoRows" border height="420">
            <el-table-column prop="title" label="待办标题" min-width="220" show-overflow-tooltip />
            <el-table-column prop="biz_type" label="业务类型" width="110" />
            <el-table-column label="优先级" width="100">
              <template #default="{ row }"><el-tag :type="priorityTagType(row.priority)">{{ row.priority }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="due_at" label="到期时间" min-width="170" />
            <el-table-column label="超时" width="90">
              <template #default="{ row }"><el-tag :type="row.overdue ? 'danger' : 'success'">{{ row.overdue ? '是' : '否' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="remind_count" label="催办次数" width="100" />
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <el-button link type="warning" @click="remindTodo(row)">催办</el-button>
                <el-button link type="primary" @click="completeTodo(row)">处理完成</el-button>
                <el-button link @click="jumpBiz(row)">跳转</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            class="pager"
            layout="total, prev, pager, next"
            :total="todoTotal"
            :page-size="todoPageSize"
            v-model:current-page="todoPage"
            @current-change="fetchTodos"
          />
        </el-tab-pane>

        <el-tab-pane label="我的已办" name="done">
          <div class="toolbar">
            <el-input v-model="doneQuery.keyword" clearable placeholder="关键词" style="width: 240px" />
            <el-select v-model="doneQuery.bizType" clearable placeholder="业务类型" style="width: 150px">
              <el-option label="订单" value="ORDER" />
              <el-option label="主数据" value="MDM" />
              <el-option label="调拨" value="TRANSFER" />
              <el-option label="任务" value="TASK" />
              <el-option label="异常" value="EXCEPTION" />
            </el-select>
            <el-button type="primary" @click="fetchDones">查询</el-button>
          </div>
          <el-table :data="doneRows" border height="420">
            <el-table-column prop="title" label="事项" min-width="260" show-overflow-tooltip />
            <el-table-column prop="biz_type" label="业务类型" width="110" />
            <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="todoStatusTagType(row.status)">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column prop="done_at" label="完成时间" min-width="170" />
            <el-table-column prop="done_comment" label="处理结论" min-width="220" show-overflow-tooltip />
          </el-table>
          <el-pagination class="pager" layout="total, prev, pager, next" :total="doneTotal" :page-size="donePageSize" v-model:current-page="donePage" @current-change="fetchDones" />
        </el-tab-pane>

        <el-tab-pane label="消息通知中心" name="message">
          <div class="toolbar">
            <el-input v-model="messageQuery.keyword" clearable placeholder="关键词" style="width: 240px" />
            <el-select v-model="messageQuery.status" clearable placeholder="状态" style="width: 130px"><el-option label="未读" value="UNREAD" /><el-option label="已读" value="READ" /></el-select>
            <el-select v-model="messageQuery.category" clearable placeholder="分类" style="width: 130px"><el-option label="待办" value="TODO" /><el-option label="审批" value="APPROVAL" /><el-option label="任务" value="TASK" /><el-option label="升级" value="ESCALATION" /></el-select>
            <el-button type="primary" @click="fetchMessages">查询</el-button>
            <el-button @click="batchReadMessages">批量已读</el-button>
          </div>
          <el-table :data="messageRows" border height="420" @selection-change="handleMessageSelectionChange">
            <el-table-column type="selection" width="46" />
            <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
            <el-table-column prop="category" label="分类" width="120" />
            <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
            <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'UNREAD' ? 'warning' : 'success'">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column prop="created_at" label="时间" min-width="170" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" :disabled="row.status === 'READ'" @click="markMessageRead(row)">已读</el-button>
                <el-button link @click="jumpBiz(row)">跳转</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" layout="total, prev, pager, next" :total="messageTotal" :page-size="messagePageSize" v-model:current-page="messagePage" @current-change="fetchMessages" />
        </el-tab-pane>

        <el-tab-pane label="统一审批中心" name="approval">
          <div class="toolbar">
            <el-input v-model="approvalQuery.keyword" clearable placeholder="关键词" style="width: 240px" />
            <el-select v-model="approvalQuery.status" clearable placeholder="审批状态" style="width: 150px"><el-option label="待审批" value="PENDING" /><el-option label="已通过" value="APPROVED" /><el-option label="已驳回" value="REJECTED" /></el-select>
            <el-select v-model="approvalQuery.bizType" clearable placeholder="业务类型" style="width: 150px"><el-option label="订单" value="ORDER" /><el-option label="主数据" value="MDM" /><el-option label="调拨" value="TRANSFER" /></el-select>
            <el-button type="primary" @click="fetchApprovals">查询</el-button>
          </div>
          <el-table :data="approvalRows" border height="420">
            <el-table-column prop="title" label="审批标题" min-width="240" show-overflow-tooltip />
            <el-table-column prop="biz_type" label="业务类型" width="110" />
            <el-table-column prop="biz_id" label="业务单号" min-width="140" />
            <el-table-column prop="applicant_name" label="申请人" width="110" />
            <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'PENDING' ? 'warning' : (row.status === 'APPROVED' ? 'success' : 'danger')">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column prop="submitted_at" label="提交时间" min-width="170" />
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <el-button link type="success" :disabled="row.status !== 'PENDING'" @click="doApproval(row, 'APPROVE')">通过</el-button>
                <el-button link type="danger" :disabled="row.status !== 'PENDING'" @click="doApproval(row, 'REJECT')">驳回</el-button>
                <el-button link @click="viewApprovalRecords(row)">记录</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" layout="total, prev, pager, next" :total="approvalTotal" :page-size="approvalPageSize" v-model:current-page="approvalPage" @current-change="fetchApprovals" />
        </el-tab-pane>

        <el-tab-pane label="任务中心" name="task">
          <div class="toolbar">
            <el-input v-model="taskQuery.keyword" clearable placeholder="关键词" style="width: 240px" />
            <el-select v-model="taskQuery.status" clearable placeholder="任务状态" style="width: 150px"><el-option label="运行中" value="RUNNING" /><el-option label="成功" value="SUCCESS" /><el-option label="失败" value="FAILED" /><el-option label="部分成功" value="PARTIAL_SUCCESS" /></el-select>
            <el-select v-model="taskQuery.taskType" clearable placeholder="任务类型" style="width: 140px"><el-option label="导入" value="IMPORT" /><el-option label="导出" value="EXPORT" /><el-option label="同步" value="SYNC" /></el-select>
            <el-button type="primary" @click="fetchTasks">查询</el-button>
          </div>
          <el-table :data="taskRows" border height="420">
            <el-table-column prop="task_key" label="任务编号" min-width="140" />
            <el-table-column prop="task_name" label="任务名称" min-width="220" show-overflow-tooltip />
            <el-table-column prop="task_type" label="类型" width="90" />
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === 'SUCCESS' ? 'success' : (row.status === 'RUNNING' ? 'primary' : 'danger')">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column prop="started_at" label="开始时间" min-width="170" />
            <el-table-column prop="last_error" label="失败原因" min-width="180" show-overflow-tooltip />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button link @click="viewTaskLogs(row)">日志</el-button>
                <el-button link type="warning" :disabled="!row.retryable" @click="retryTask(row)">重试</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" layout="total, prev, pager, next" :total="taskTotal" :page-size="taskPageSize" v-model:current-page="taskPage" @current-change="fetchTasks" />
        </el-tab-pane>

        <el-tab-pane label="催办与超时提醒" name="remind">
          <el-card shadow="never" class="inner-card">
            <template #header>超时规则配置</template>
            <el-table :data="ruleRows" border>
              <el-table-column prop="biz_type" label="业务类型" width="120" />
              <el-table-column label="超时阈值(小时)" width="160">
                <template #default="{ row }"><el-input-number v-model="row.timeout_hours" :min="1" /></template>
              </el-table-column>
              <el-table-column label="升级阈值(小时)" width="160">
                <template #default="{ row }"><el-input-number v-model="row.escalate_hours" :min="1" /></template>
              </el-table-column>
              <el-table-column label="升级到" min-width="180">
                <template #default="{ row }"><el-input v-model="row.escalate_to" /></template>
              </el-table-column>
              <el-table-column label="启用" width="90">
                <template #default="{ row }"><el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" /></template>
              </el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }"><el-button link type="primary" @click="saveRule(row)">保存</el-button></template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never" class="inner-card">
            <template #header>催办与升级记录</template>
            <el-table :data="reminderRows" border height="260">
              <el-table-column prop="todo_id" label="待办ID" width="100" />
              <el-table-column prop="action" label="动作" width="100" />
              <el-table-column prop="operator_name" label="操作人" width="120" />
              <el-table-column prop="comment" label="说明" min-width="220" show-overflow-tooltip />
              <el-table-column prop="created_at" label="时间" min-width="170" />
            </el-table>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="approvalRecordDialogVisible" :title="approvalRecordTitle" width="720px">
      <el-table :data="approvalRecordRows" border max-height="360">
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column prop="action" label="动作" width="120" />
        <el-table-column prop="operator" label="处理人" width="120" />
        <el-table-column prop="comment" label="意见" min-width="220" show-overflow-tooltip />
      </el-table>
    </el-dialog>

    <el-dialog v-model="taskLogDialogVisible" :title="taskLogTitle" width="760px">
      <el-table :data="taskLogRows" border max-height="380">
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column prop="level" label="级别" width="90" />
        <el-table-column prop="message" label="日志内容" min-width="320" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.workflow-page { display: flex; flex-direction: column; gap: 12px; }
.page-head { display: flex; align-items: center; justify-content: space-between; }
.page-head h2 { margin: 0; font-size: 20px; color: #0f172a; }
.page-head p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
.summary-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.summary-card { border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 12px; cursor: pointer; transition: all 0.2s ease; }
.summary-card:hover { border-color: #93c5fd; box-shadow: 0 8px 14px rgba(37, 99, 235, 0.08); }
.summary-label { font-size: 12px; color: #64748b; }
.summary-value { margin-top: 8px; font-size: 24px; font-weight: 700; color: #0f172a; }
.toolbar { display: flex; gap: 10px; margin-bottom: 10px; }
.pager { margin-top: 12px; justify-content: flex-end; }
.inner-card { margin-bottom: 12px; }
@media (max-width: 1400px) {
  .summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 980px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar { flex-wrap: wrap; }
}
</style>
