<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const appStore = useAppStore()
const isSuperAdmin = computed(() => appStore.isSuperAdmin)

// ===== 常量 =====
const ADJUST_DIRECTION_MAP: Record<string, string> = {
  UP: '向上调整（增加天数）',
  DOWN: '向下调整（减少天数）',
  BOTH: '双向调整'
}
const DIRECTION_OPTIONS = [
  { value: 'UP', label: '向上调整（增加天数）' },
  { value: 'DOWN', label: '向下调整（减少天数）' },
  { value: 'BOTH', label: '双向调整' }
]

// ===== 列表 =====
const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterSkuCode = ref('')
const filterWarehouse = ref('')
const filterDirection = ref('')
const filterStatus = ref('')
const warehouseOptions = ref<string[]>([])

// ===== 编辑弹窗 =====
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  rule_name: '',
  sku_code: '',
  sku_name: '',
  category: '',
  warehouse: '',
  adjust_direction: 'BOTH',
  adjust_days: 0,
  effective_min_days: 0,
  effective_max_days: 0,
  effective_start: '',
  effective_end: '',
  status: 1,
  remark: ''
})

// 安全库存引用信息
const safetyStockInfo = ref<{ min: number; max: number; found: boolean }>({ min: 7, max: 21, found: false })

// ===== 批量设置弹窗 =====
const batchDialog = ref(false)
const batchSaving = ref(false)
const batchJson = ref('')

// watch SKU code changes to look up safety stock params
watch([() => form.sku_code, () => form.warehouse], async ([sku, wh]) => {
  if (!sku || !wh) {
    safetyStockInfo.value = { min: 7, max: 21, found: false }
    return
  }
  try {
    const { data } = await axios.get(`/safety-stock-params/by-sku/${encodeURIComponent(String(sku))}`)
    if (data.code === 200 && data.data?.length) {
      const param = data.data.find((p: any) => String(p.warehouse) === String(wh))
      if (param) {
        safetyStockInfo.value = { min: param.min_safety_days, max: param.max_safety_days, found: true }
      } else {
        safetyStockInfo.value = { min: 7, max: 21, found: false }
      }
    } else {
      safetyStockInfo.value = { min: 7, max: 21, found: false }
    }
  } catch {
    safetyStockInfo.value = { min: 7, max: 21, found: false }
  }
})

// auto-calculate effective range when adjust_days changes
watch(() => form.adjust_days, (days) => {
  const base = safetyStockInfo.value
  form.effective_min_days = Math.max(0, base.min - Number(days))
  form.effective_max_days = base.max + Number(days)
})

const fetchList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get('/rules/adjustable-days', {
      params: {
        page: page.value, pageSize: pageSize.value,
        keyword: keyword.value || undefined,
        sku_code: filterSkuCode.value || undefined,
        warehouse: filterWarehouse.value || undefined,
        adjust_direction: filterDirection.value || undefined,
        status: filterStatus.value || undefined
      }
    })
    if (data.code === 200) {
      rows.value = data.data.list || []
      total.value = data.data.total || 0
    }
  } catch { ElMessage.error('获取可调天数规则失败') }
  finally { loading.value = false }
}

const fetchFilterOptions = async () => {
  try {
    const { data } = await axios.get('/rules/adjustable-days/filter-options')
    if (data.code === 200) {
      warehouseOptions.value = data.data.warehouses || []
    }
  } catch { /* ignore */ }
}

const openDialog = (row?: any) => {
  if (row) {
    editingId.value = row.id
    Object.assign(form, {
      rule_name: row.rule_name || '', sku_code: row.sku_code, sku_name: row.sku_name || '',
      category: row.category || '', warehouse: row.warehouse,
      adjust_direction: row.adjust_direction, adjust_days: row.adjust_days,
      effective_min_days: row.effective_min_days, effective_max_days: row.effective_max_days,
      effective_start: row.effective_start || '', effective_end: row.effective_end || '',
      status: row.status, remark: row.remark || ''
    })
  } else {
    editingId.value = null
    Object.assign(form, {
      rule_name: '', sku_code: '', sku_name: '', category: '', warehouse: '',
      adjust_direction: 'BOTH', adjust_days: 0, effective_min_days: 0, effective_max_days: 0,
      effective_start: '', effective_end: '', status: 1, remark: ''
    })
    safetyStockInfo.value = { min: 7, max: 21, found: false }
  }
  dialogVisible.value = true
}

const saveForm = async () => {
  if (!form.sku_code || !form.warehouse) return ElMessage.warning('SKU编码和仓库必填')
  saving.value = true
  try {
    if (editingId.value) {
      await axios.put(`/rules/adjustable-days/${editingId.value}`, form)
    } else {
      await axios.post('/rules/adjustable-days', form)
    }
    ElMessage.success(editingId.value ? '更新成功' : '新增成功')
    dialogVisible.value = false
    fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '保存失败')
  } finally { saving.value = false }
}

const deleteRow = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除 SKU[${row.sku_code}] 在 ${row.warehouse} 的可调天数规则吗？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await axios.delete(`/rules/adjustable-days/${row.id}`)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '删除失败')
  }
}

const handleBatchSet = async () => {
  if (!batchJson.value.trim()) return ElMessage.warning('请粘贴JSON数据')
  let parsed: any[]
  try { parsed = JSON.parse(batchJson.value) } catch {
    return ElMessage.error('JSON格式不正确')
  }
  if (!Array.isArray(parsed)) return ElMessage.error('数据必须是数组格式')

  batchSaving.value = true
  try {
    const { data } = await axios.post('/rules/adjustable-days/batch-set', { data: parsed })
    if (data.code === 200) {
      ElMessage.success(`批量设置完成：新增 ${data.data.created} 条，更新 ${data.data.updated} 条，跳过 ${data.data.skipped} 条`)
      batchDialog.value = false
      batchJson.value = ''
      fetchList()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '批量设置失败')
  } finally { batchSaving.value = false }
}

const handleSizeChange = (val: number) => { pageSize.value = val; fetchList() }
const handlePageChange = (val: number) => { page.value = val; fetchList() }

onMounted(() => {
  fetchList()
  fetchFilterOptions()
})
</script>

<template>
  <div class="adjustable-days-page">
    <div class="page-header">
      <h3>可调天数规则</h3>
      <p class="page-desc">
        库存分配/调拨计划的弹性配置。定义各仓库在不同SKU下的"可调天数"，允许在安全库存天数基础上灵活调整。
        用于应对临时促销、库存紧张等特殊情况。依赖"安全库存参数"中设置的基础天数范围。
      </p>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" placeholder="搜索 SKU/名称/仓库" clearable style="width:240px" @clear="fetchList" @keyup.enter="fetchList" />
        <el-select v-model="filterWarehouse" placeholder="仓库筛选" clearable style="width:140px" @change="fetchList">
          <el-option v-for="w in warehouseOptions" :key="w" :label="w" :value="w" />
        </el-select>
        <el-select v-model="filterDirection" placeholder="调整方向" clearable style="width:170px" @change="fetchList">
          <el-option v-for="d in DIRECTION_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width:100px" @change="fetchList">
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <el-button type="default" @click="fetchList">查询</el-button>
      </div>
      <div class="toolbar-right">
        <el-button type="success" @click="batchDialog = true">批量设置</el-button>
        <el-button type="primary" @click="openDialog()">新增规则</el-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <el-table :data="rows" v-loading="loading" border stripe style="width:100%">
      <el-table-column prop="sku_code" label="SKU编码" width="140" />
      <el-table-column prop="sku_name" label="SKU简称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="warehouse" label="仓库" width="120" />
      <el-table-column label="调整方向" width="150">
        <template #default="{ row }">
          <el-tag :type="row.adjust_direction === 'BOTH' ? 'warning' : row.adjust_direction === 'UP' ? 'success' : 'danger'" size="small">
            {{ ADJUST_DIRECTION_MAP[row.adjust_direction] || row.adjust_direction }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="adjust_days" label="可调天数" width="100" align="center" />
      <el-table-column label="安全库存基础" width="130" align="center">
        <template #default="{ row }">
          {{ row.safety_min_days }} ~ {{ row.safety_max_days }} 天
        </template>
      </el-table-column>
      <el-table-column label="生效范围" width="150" align="center">
        <template #default="{ row }">
          <el-tag type="primary" size="small">{{ row.effective_min_days }} ~ {{ row.effective_max_days }} 天</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="生效时间" width="210">
        <template #default="{ row }">
          <span v-if="row.effective_start">{{ row.effective_start }} ~ {{ row.effective_end }}</span>
          <span v-else class="text-muted">长期有效</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" link @click="deleteRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrap">
      <el-pagination
        v-model:current-page="page" v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]" :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange" @current-change="handlePageChange"
      />
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑可调天数规则' : '新增可调天数规则'" width="700px" :close-on-click-modal="false">
      <el-form :model="form" label-width="120px">
        <el-form-item label="规则名称">
          <el-input v-model="form.rule_name" placeholder="可选，规则描述" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="SKU编码" required>
              <el-input v-model="form.sku_code" placeholder="请输入SKU编码" :disabled="!!editingId" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SKU简称">
              <el-input v-model="form.sku_name" placeholder="请输入SKU简称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="品类">
          <el-input v-model="form.category" placeholder="请输入品类" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="仓库" required>
              <el-input v-model="form.warehouse" placeholder="请输入仓库名称" :disabled="!!editingId" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="调整方向" required>
              <el-select v-model="form.adjust_direction" style="width:100%">
                <el-option v-for="d in DIRECTION_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 安全库存引用 -->
        <el-alert v-if="form.sku_code && form.warehouse" :type="safetyStockInfo.found ? 'success' : 'warning'" :closable="false" style="margin-bottom:15px">
          <template #title>
            <span v-if="safetyStockInfo.found">
              安全库存基础天数：{{ safetyStockInfo.min }} ~ {{ safetyStockInfo.max }} 天
              （来自安全库存参数）
            </span>
            <span v-else>
              未找到该SKU在此仓库的安全库存参数，将使用默认值 7 ~ 21 天
            </span>
          </template>
        </el-alert>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="可调天数" required>
              <el-input-number v-model="form.adjust_days" :min="0" :max="365" style="width:100%" />
              <div class="field-hint">基于安全库存天数上下浮动</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width:100%">
                <el-option label="启用" :value="1" />
                <el-option label="禁用" :value="0" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="生效最小天数">
              <el-input-number v-model="form.effective_min_days" :min="0" style="width:100%" />
              <div class="field-hint">实际生效的最小天数</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生效最大天数">
              <el-input-number v-model="form.effective_max_days" :min="0" style="width:100%" />
              <div class="field-hint">实际生效的最大天数</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="生效开始">
              <el-date-picker v-model="form.effective_start" type="date" placeholder="生效开始日期" style="width:100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生效结束">
              <el-date-picker v-model="form.effective_end" type="date" placeholder="生效结束日期" style="width:100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选，如：促销期弹性调整" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量设置弹窗 -->
    <el-dialog v-model="batchDialog" title="批量设置可调天数" width="700px">
      <el-alert type="info" :closable="false" style="margin-bottom:15px">
        请粘贴 JSON 数组，每项包含: sku_code, sku_name, warehouse, adjust_direction(UP/DOWN/BOTH), adjust_days
      </el-alert>
      <el-input v-model="batchJson" type="textarea" :rows="12" placeholder='[{"sku_code":"xxx","warehouse":"xxx","adjust_direction":"BOTH","adjust_days":3}]' />
      <template #footer>
        <el-button @click="batchDialog = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="handleBatchSet">开始设置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.adjustable-days-page { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-header h3 { margin: 0 0 4px; font-size: 18px; }
.page-desc { margin: 0; color: #909399; font-size: 13px; max-width: 900px; line-height: 1.6; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }
.field-hint { font-size: 11px; color: #909399; margin-top: 2px; }
.text-muted { color: #c0c4cc; }
</style>
