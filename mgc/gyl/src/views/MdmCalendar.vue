<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Edit } from '@element-plus/icons-vue'
import axios from 'axios'

const viewMode = ref<'calendar' | 'list'>('calendar')
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const calendarData = ref<any[]>([])
const listData = ref<any[]>([])
const listTotal = ref(0)
const loading = ref(false)

// 月份切换
const prevMonth = () => { if (currentMonth.value === 1) { currentMonth.value = 12; currentYear.value-- } else currentMonth.value-- }
const nextMonth = () => { if (currentMonth.value === 12) { currentMonth.value = 1; currentYear.value++ } else currentMonth.value++ }

// 获取月视图数据
const fetchMonthData = async () => {
  loading.value = true
  try {
    const res = await axios.get('/master/calendar/month', { params: { year: currentYear.value, month: currentMonth.value } })
    if (res.data.code === 200) calendarData.value = res.data.data
  } finally { loading.value = false }
}

// 月历中每天的数据查找
const dateMap = computed(() => {
  const m: Record<string, any> = {}
  calendarData.value.forEach(d => { m[d.cal_date?.substring(0, 10)] = d })
  return m
})

// 生成当月所有天
const calendarDays = computed(() => {
  const year = currentYear.value, month = currentMonth.value
  const days: { date: string; day: number; isCurrentMonth: boolean }[] = []
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  // 补全头部（上月末尾）
  let startDow = firstDay.getDay(); if (startDow === 0) startDow = 7
  for (let i = startDow - 1; i > 0; i--) {
    const d = new Date(year, month - 1, 1 - i)
    days.push({ date: d.toISOString().substring(0, 10), day: d.getDate(), isCurrentMonth: false })
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month - 1, i)
    days.push({ date: d.toISOString().substring(0, 10), day: i, isCurrentMonth: true })
  }
  // 补全尾部（下月开头，补满6行42格）
  while (days.length % 7 !== 0) {
    const d = new Date(year, month, days.length - lastDay.getDate() - (startDow - 1) + 1)
    days.push({ date: d.toISOString().substring(0, 10), day: d.getDate(), isCurrentMonth: false })
  }
  return days
})

// 获取单天颜色class
const getDayClass = (dateStr: string, isCurrentMonth: boolean) => {
  if (!isCurrentMonth) return 'day-other'
  const d = dateMap.value[dateStr]
  if (!d) return 'day-normal'
  if (d.is_holiday) return 'day-holiday'
  if (!d.is_workday) return d.is_weekend ? 'day-weekend' : 'day-off'
  return 'day-workday'
}

// 编辑单日弹窗
const editDialogVisible = ref(false)
const editForm = reactive({ id: 0, cal_date: '', is_workday: 1, is_holiday: 0, holiday_name: '', remark: '' })

const handleDayClick = (dateStr: string) => {
  const d = dateMap.value[dateStr]
  if (!d) return ElMessage.warning('该日期暂无数据')
  Object.assign(editForm, { id: d.id, cal_date: dateStr, is_workday: d.is_workday, is_holiday: d.is_holiday, holiday_name: d.holiday_name || '', remark: d.remark || '' })
  editDialogVisible.value = true
}

const submitEdit = async () => {
  try {
    const res = await axios.put(`/master/calendar/${editForm.id}`, editForm)
    if (res.data.code === 200) { ElMessage.success('修改成功'); editDialogVisible.value = false; fetchMonthData() }
    else ElMessage.error(res.data.msg)
  } catch (e: any) { ElMessage.error(e.response?.data?.msg || '操作失败') }
}

// 列表视图
const listQuery = reactive({ year: new Date().getFullYear(), month: '', isHoliday: '', isWorkday: '', page: 1, pageSize: 50 })
const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/master/calendar', { params: listQuery })
    if (res.data.code === 200) { listData.value = res.data.data.list; listTotal.value = res.data.data.total }
  } finally { loading.value = false }
}

const weekDays = ['一', '二', '三', '四', '五', '六', '日']

onMounted(() => { fetchMonthData() })
</script>

<template>
  <div class="cal-container">
    <div class="page-header">
      <div class="page-title"><span class="title-icon">📅</span><div><h2>业务日历</h2><p class="subtitle">Master Data · Business Calendar</p></div></div>
      <el-radio-group v-model="viewMode" @change="viewMode === 'list' && fetchList()">
        <el-radio-button value="calendar">月历视图</el-radio-button>
        <el-radio-button value="list">列表视图</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 月历视图 -->
    <div v-if="viewMode === 'calendar'" class="cal-body">
      <div class="cal-nav">
        <el-button :icon="ArrowLeft" circle @click="prevMonth(), fetchMonthData()" />
        <span class="cal-title">{{ currentYear }} 年 {{ currentMonth }} 月</span>
        <el-button :icon="ArrowRight" circle @click="nextMonth(), fetchMonthData()" />
      </div>

      <div class="cal-grid" v-loading="loading">
        <div class="cal-weekday" v-for="w in weekDays" :key="w">{{ w }}</div>
        <div v-for="d in calendarDays" :key="d.date"
          class="cal-day" :class="[getDayClass(d.date, d.isCurrentMonth), !d.isCurrentMonth ? '' : 'clickable']"
          @click="d.isCurrentMonth && handleDayClick(d.date)">
          <span class="day-num">{{ d.day }}</span>
          <span v-if="dateMap[d.date]?.holiday_name" class="day-holiday-name">{{ dateMap[d.date].holiday_name }}</span>
          <span v-else-if="dateMap[d.date] && dateMap[d.date].is_workday && !dateMap[d.date].is_holiday && !dateMap[d.date].is_weekend" class="day-work-label">工作日</span>
        </div>
      </div>

      <div class="legend">
        <span class="legend-item"><i class="legend-dot holiday"></i>节假日</span>
        <span class="legend-item"><i class="legend-dot weekend"></i>周末</span>
        <span class="legend-item"><i class="legend-dot workday"></i>工作日</span>
        <span class="legend-item"><i class="legend-dot normal"></i>无数据</span>
      </div>
    </div>

    <!-- 列表视图 -->
    <div v-else class="list-body">
      <div class="filter-bar">
        <el-form :inline="true" :model="listQuery" @submit.prevent="fetchList">
          <el-form-item label="年份"><el-input-number v-model="listQuery.year" :min="2020" :max="2035" style="width:120px" /></el-form-item>
          <el-form-item label="月份">
            <el-select v-model="listQuery.month" placeholder="全年" clearable style="width:100px">
              <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
            </el-select>
          </el-form-item>
          <el-form-item label="是否节假日">
            <el-select v-model="listQuery.isHoliday" placeholder="全部" clearable style="width:110px">
              <el-option label="是" value="1" /><el-option label="否" value="0" />
            </el-select>
          </el-form-item>
          <el-form-item><el-button type="primary" @click="fetchList">查询</el-button></el-form-item>
        </el-form>
      </div>
      <el-table :data="listData" border stripe v-loading="loading">
        <el-table-column prop="cal_date" label="日期" width="120">
          <template #default="{ row }">{{ String(row.cal_date).substring(0,10) }}</template>
        </el-table-column>
        <el-table-column prop="day_of_week" label="星期" width="80" align="center">
          <template #default="{ row }">{{ ['','周一','周二','周三','周四','周五','周六','周日'][row.day_of_week] || '-' }}</template>
        </el-table-column>
        <el-table-column prop="is_workday" label="工作日" width="90" align="center">
          <template #default="{ row }"><el-tag :type="row.is_workday ? 'success' : 'info'" size="small">{{ row.is_workday ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="is_holiday" label="节假日" width="90" align="center">
          <template #default="{ row }"><el-tag v-if="row.is_holiday" type="danger" size="small">是</el-tag><span v-else>-</span></template>
        </el-table-column>
        <el-table-column prop="holiday_name" label="节假日名称" width="120" />
        <el-table-column prop="fscl_year" label="财年" width="80" align="center" />
        <el-table-column prop="fscl_week_range" label="财年周范围" width="130" />
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :icon="Edit"
              @click="Object.assign(editForm, { id: row.id, cal_date: String(row.cal_date).substring(0,10), is_workday: row.is_workday, is_holiday: row.is_holiday, holiday_name: row.holiday_name||'', remark: row.remark||'' }); editDialogVisible = true">
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrapper">
        <el-pagination v-model:current-page="listQuery.page" v-model:page-size="listQuery.pageSize" :page-sizes="[50,100,200]" layout="total, sizes, prev, pager, next" :total="listTotal" @current-change="fetchList" @size-change="fetchList" />
      </div>
    </div>

    <!-- 编辑单日弹窗 -->
    <el-dialog v-model="editDialogVisible" :title="`编辑日期：${editForm.cal_date}`" width="420px" draggable class="mdm-dialog">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="日期">{{ editForm.cal_date }}</el-form-item>
        <el-form-item label="是否工作日">
          <el-radio-group v-model="editForm.is_workday"><el-radio :value="1">是</el-radio><el-radio :value="0">否</el-radio></el-radio-group>
        </el-form-item>
        <el-form-item label="是否节假日">
          <el-radio-group v-model="editForm.is_holiday"><el-radio :value="1">是</el-radio><el-radio :value="0">否</el-radio></el-radio-group>
        </el-form-item>
        <el-form-item v-if="editForm.is_holiday" label="节假日名称">
          <el-input v-model="editForm.holiday_name" placeholder="如：清明节" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cal-container { padding: 20px; background: #f8fafc; min-height: calc(100vh - 60px); }
.page-header { display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 12px; padding: 18px 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.page-title { display: flex; align-items: center; gap: 12px; }
.title-icon { font-size: 28px; }
.page-title h2 { font-size: 17px; font-weight: 700; color: #1e293b; margin: 0 0 2px; }
.subtitle { font-size: 12px; color: #94a3b8; margin: 0; }
.cal-body { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.cal-nav { display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 16px; }
.cal-title { font-size: 20px; font-weight: 700; color: #1e293b; min-width: 160px; text-align: center; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-weekday { text-align: center; font-size: 12px; font-weight: 600; color: #64748b; padding: 8px 0; }
.cal-day { min-height: 80px; border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: #f8fafc; border: 1px solid #e2e8f0; }
.cal-day.clickable { cursor: pointer; transition: all .15s; }
.cal-day.clickable:hover { border-color: #6366f1; background: #f0f0ff; }
.day-other { opacity: 0.35; }
.day-holiday { background: #fee2e2; border-color: #fca5a5; }
.day-weekend { background: #f1f5f9; border-color: #cbd5e1; }
.day-off { background: #fff7ed; border-color: #fed7aa; }
.day-workday { background: #f0fdf4; border-color: #86efac; }
.day-normal { background: #f8fafc; }
.day-num { font-size: 15px; font-weight: 600; color: #334155; }
.day-holiday .day-num { color: #dc2626; }
.day-holiday-name { font-size: 10px; color: #dc2626; font-weight: 500; }
.day-work-label { font-size: 10px; color: #16a34a; }
.legend { display: flex; gap: 20px; justify-content: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
.legend-dot { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
.holiday { background: #fee2e2; border: 1.5px solid #fca5a5; }
.weekend { background: #f1f5f9; border: 1.5px solid #cbd5e1; }
.workday { background: #f0fdf4; border: 1.5px solid #86efac; }
.normal { background: #f8fafc; border: 1.5px solid #e2e8f0; }
.list-body { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.filter-bar { margin-bottom: 12px; }
.pagination-wrapper { display: flex; justify-content: flex-end; padding-top: 12px; }
.mdm-dialog :deep(.el-dialog__header) { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; }
.mdm-dialog :deep(.el-dialog__title) { color: #fff; font-weight: 600; }
.mdm-dialog :deep(.el-dialog__headerbtn .el-dialog__close) { color: rgba(255,255,255,.8); }
</style>
