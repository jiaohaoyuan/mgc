<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const appStore = useAppStore()
const isSuperAdmin = computed(() => appStore.isSuperAdmin)

// ===== 常量 =====
const CAPACITY_TYPE_MAP: Record<string, string> = {
  STORAGE: '库容（库存容量）',
  INBOUND: '收货能力上限（入库能力）',
  OUTBOUND: '出库能力上限（发货能力）'
}
const CAPACITY_TYPE_OPTIONS = [
  { value: 'STORAGE', label: '库容（库存容量）' },
  { value: 'INBOUND', label: '收货能力上限（入库能力）' },
  { value: 'OUTBOUND', label: '出库能力上限（发货能力）' }
]
const SCOPE_TYPE_OPTIONS = [
  { value: 'PRODUCT', label: '产品（SKU）' },
  { value: 'CATEGORY', label: '品类' }
]

// ===== 列表 =====
const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterWarehouse = ref('')
const filterCapacityType = ref('')
const filterScopeType = ref('')
const filterStatus = ref('')
const warehouseOptions = ref<string[]>([])

// ===== 编辑弹窗 =====
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  rule_name: '',
  warehouse: '',
  capacity_type: 'STORAGE',
  capacity_value: 0,
  capacity_unit: '提',
  scope_type: 'PRODUCT',
  scope_code: '',
  scope_name: '',
  effective_start: '',
  effective_end: '',
  status: 1,
  remark: ''
})

// ===== SKU/品类选择器 =====
const skuSearchLoading = ref(false)
const skuOptions = ref<any[]>([])
const categoryOptions = ref<any[]>([])

const searchSku = async (query: string) => {
  if (!query) { skuOptions.value = []; return }
  skuSearchLoading.value = true
  try {
    const { data } = await axios.get('/products', { params: { keyword: query, pageSize: 50 } })
    if (data.code === 200) {
      skuOptions.value = (data.data.list || []).map((s: any) => ({
        value: s.sku_code || s.code,
        label: `${s.sku_code || s.code} - ${s.sku_name || s.name || ''}`
      }))
    }
  } catch {
    // fallback: no remote SKU search available
    skuOptions.value = []
  } finally { skuSearchLoading.value = false }
}

const searchCategory = async (query: string) => {
  if (!query) { categoryOptions.value = []; return }
  try {
    const { data } = await axios.get('/categories', { params: { keyword: query, pageSize: 50 } })
    if (data.code === 200) {
      categoryOptions.value = (data.data.list || data.data || []).map((c: any) => ({
        value: c.category_code || c.code || c.id,
        label: `${c.category_code || c.code || c.id} - ${c.category_name || c.name || ''}`
      }))
    }
  } catch {
    categoryOptions.value = []
  }
}

const fetchList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get('/rules/warehouse-capacity', {
      params: {
        page: page.value, pageSize: pageSize.value,
        keyword: keyword.value || undefined,
        warehouse: filterWarehouse.value || undefined,
        capacity_type: filterCapacityType.value || undefined,
        scope_type: filterScopeType.value || undefined,
        status: filterStatus.value || undefined
      }
    })
    if (data.code === 200) {
      rows.value = data.data.list || []
      total.value = data.data.total || 0
    }
  } catch { ElMessage.error('获取仓能力规则失败') }
  finally { loading.value = false }
}

const fetchFilterOptions = async () => {
  try {
    const { data } = await axios.get('/rules/warehouse-capacity/filter-options')
    if (data.code === 200) {
      warehouseOptions.value = data.data.warehouses || []
    }
  } catch { /* ignore */ }
}

const openDialog = (row?: any) => {
  if (row) {
    editingId.value = row.id
    Object.assign(form, {
      rule_name: row.rule_name || '', warehouse: row.warehouse, capacity_type: row.capacity_type,
      capacity_value: row.capacity_value, capacity_unit: row.capacity_unit || '提',
      scope_type: row.scope_type || 'PRODUCT', scope_code: row.scope_code, scope_name: row.scope_name || '',
      effective_start: row.effective_start || '', effective_end: row.effective_end || '',
      status: row.status, remark: row.remark || ''
    })
  } else {
    editingId.value = null
    Object.assign(form, {
      rule_name: '', warehouse: '', capacity_type: 'STORAGE', capacity_value: 0, capacity_unit: '提',
      scope_type: 'PRODUCT', scope_code: '', scope_name: '',
      effective_start: '', effective_end: '', status: 1, remark: ''
    })
  }
  dialogVisible.value = true
}

const saveForm = async () => {
  if (!form.warehouse) return ElMessage.warning('仓库不能为空')
  if (!form.scope_code) return ElMessage.warning('产品/品类编码不能为空')
  saving.value = true
  try {
    if (editingId.value) {
      await axios.put(`/rules/warehouse-capacity/${editingId.value}`, form)
    } else {
      await axios.post('/rules/warehouse-capacity', form)
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
    await ElMessageBox.confirm(`确定删除 ${row.warehouse} 的 ${CAPACITY_TYPE_MAP[row.capacity_type] || row.capacity_type} 规则吗？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await axios.delete(`/rules/warehouse-capacity/${row.id}`)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '删除失败')
  }
}

const handleSizeChange = (val: number) => { pageSize.value = val; fetchList() }
const handlePageChange = (val: number) => { page.value = val; fetchList() }

onMounted(() => {
  fetchList()
  fetchFilterOptions()
})
</script>

<template>
  <div class="warehouse-capacity-page">
    <div class="page-header">
      <h3>仓能力规则</h3>
      <p class="page-desc">
        库存分配/调拨计划的核心约束配置。定义各仓库在不同产品/品类下的三种能力上限：库容（最大存储量）、收货能力（日入库上限）、出库能力（日发货上限）。
        同一仓库+同一产品/品类+同一能力类型，生效时间不应重叠。
      </p>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" placeholder="搜索规则名称/编码" clearable style="width:220px" @clear="fetchList" @keyup.enter="fetchList" />
        <el-select v-model="filterWarehouse" placeholder="仓库筛选" clearable style="width:140px" @change="fetchList">
          <el-option v-for="w in warehouseOptions" :key="w" :label="w" :value="w" />
        </el-select>
        <el-select v-model="filterCapacityType" placeholder="能力类型" clearable style="width:170px" @change="fetchList">
          <el-option v-for="t in CAPACITY_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width:100px" @change="fetchList">
          <el-option label="启用" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <el-button type="default" @click="fetchList">查询</el-button>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="openDialog()">新增规则</el-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <el-table :data="rows" v-loading="loading" border stripe style="width:100%">
      <el-table-column prop="rule_name" label="规则名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="warehouse" label="仓库" width="120" />
      <el-table-column label="能力类型" width="190">
        <template #default="{ row }">
          <el-tag>{{ CAPACITY_TYPE_MAP[row.capacity_type] || row.capacity_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="能力值" width="150" align="center">
        <template #default="{ row }">
          {{ row.capacity_value?.toLocaleString() }} {{ row.capacity_unit || '提' }}
        </template>
      </el-table-column>
      <el-table-column label="适用范围" width="130" align="center">
        <template #default="{ row }">
          <el-tag type="info" size="small">{{ row.scope_type === 'CATEGORY' ? '品类' : '产品' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="scope_code" label="编码" width="120" />
      <el-table-column prop="scope_name" label="名称" min-width="130" show-overflow-tooltip />
      <el-table-column label="生效时间" width="210">
        <template #default="{ row }">
          <span v-if="row.effective_start">{{ row.effective_start }} ~ {{ row.effective_end }}</span>
          <span v-else>-</span>
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
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑仓能力规则' : '新增仓能力规则'" width="680px" :close-on-click-modal="false">
      <el-form :model="form" label-width="120px">
        <el-form-item label="规则名称">
          <el-input v-model="form.rule_name" placeholder="可选，规则描述名称" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="仓库" required>
              <el-input v-model="form.warehouse" placeholder="请输入仓库名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="能力类型" required>
              <el-select v-model="form.capacity_type" style="width:100%">
                <el-option v-for="t in CAPACITY_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="能力值" required>
              <el-input-number v-model="form.capacity_value" :min="0" :step="100" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input v-model="form.capacity_unit" placeholder="如：提、罐、箱" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="适用范围" required>
              <el-select v-model="form.scope_type" style="width:100%">
                <el-option v-for="t in SCOPE_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="编码" required>
              <el-input v-model="form.scope_code" placeholder="SKU编码或品类编码" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="范围名称">
          <el-input v-model="form.scope_name" placeholder="可选，SKU名称或品类名称" />
        </el-form-item>
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
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width:100%">
                <el-option label="启用" :value="1" />
                <el-option label="禁用" :value="0" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.warehouse-capacity-page { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-header h3 { margin: 0 0 4px; font-size: 18px; }
.page-desc { margin: 0; color: #909399; font-size: 13px; max-width: 900px; line-height: 1.6; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
