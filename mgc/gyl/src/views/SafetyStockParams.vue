<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAppStore } from '@/stores/appStore'

const appStore = useAppStore()
const isSuperAdmin = computed(() => appStore.isSuperAdmin)

// ===== 列表数据 =====
const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterSkuCode = ref('')
const filterWarehouse = ref('')
const filterAbcType = ref('')
const filterCategory = ref('')

// 筛选选项
const warehouseOptions = ref<string[]>([])
const abcTypeOptions = ref<string[]>([])
const categoryOptions = ref<string[]>([])

// ===== 编辑弹窗 =====
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  sku_code: '',
  sku_name: '',
  category: '',
  abc_type: '',
  warehouse: '',
  min_safety_days: 7,
  max_safety_days: 21,
  remark: '',
  status: 1
})

// ===== 导入弹窗 =====
const importDialog = ref(false)
const importing = ref(false)
const importJson = ref('')

const fetchList = async () => {
  loading.value = true
  try {
    const { data } = await axios.get('/safety-stock-params', {
      params: {
        page: page.value, pageSize: pageSize.value,
        keyword: keyword.value || undefined,
        sku_code: filterSkuCode.value || undefined,
        warehouse: filterWarehouse.value || undefined,
        abc_type: filterAbcType.value || undefined,
        category: filterCategory.value || undefined
      }
    })
    if (data.code === 200) {
      rows.value = data.data.list || []
      total.value = data.data.total || 0
    }
  } catch { ElMessage.error('获取安全库存参数失败') }
  finally { loading.value = false }
}

const fetchFilterOptions = async () => {
  try {
    const { data } = await axios.get('/safety-stock-params/filter-options')
    if (data.code === 200) {
      warehouseOptions.value = data.data.warehouses || []
      abcTypeOptions.value = data.data.abcTypes || []
      categoryOptions.value = data.data.categories || []
    }
  } catch { /* ignore */ }
}

const openDialog = (row?: any) => {
  if (row) {
    editingId.value = row.id
    Object.assign(form, {
      sku_code: row.sku_code, sku_name: row.sku_name, category: row.category,
      abc_type: row.abc_type, warehouse: row.warehouse,
      min_safety_days: row.min_safety_days, max_safety_days: row.max_safety_days,
      remark: row.remark || '', status: row.status
    })
  } else {
    editingId.value = null
    Object.assign(form, {
      sku_code: '', sku_name: '', category: '', abc_type: '',
      warehouse: '', min_safety_days: 7, max_safety_days: 21, remark: '', status: 1
    })
  }
  dialogVisible.value = true
}

const saveForm = async () => {
  if (!form.sku_code || !form.warehouse) return ElMessage.warning('SKU编码和仓库必填')
  saving.value = true
  try {
    if (editingId.value) {
      await axios.put(`/safety-stock-params/${editingId.value}`, form)
    } else {
      await axios.post('/safety-stock-params', form)
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
    await ElMessageBox.confirm(`确定删除 SKU[${row.sku_code}] 在 ${row.warehouse} 的安全库存参数吗？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await axios.delete(`/safety-stock-params/${row.id}`)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '删除失败')
  }
}

const handleImport = async () => {
  if (!importJson.value.trim()) return ElMessage.warning('请粘贴JSON数据')
  let parsed: any[]
  try { parsed = JSON.parse(importJson.value) } catch {
    return ElMessage.error('JSON格式不正确')
  }
  if (!Array.isArray(parsed)) return ElMessage.error('数据必须是数组格式')

  importing.value = true
  try {
    const { data } = await axios.post('/safety-stock-params/batch-import', { data: parsed })
    if (data.code === 200) {
      ElMessage.success(`导入完成：成功 ${data.data.imported} 条，跳过 ${data.data.skipped} 条`)
      importDialog.value = false
      importJson.value = ''
      fetchList()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.msg || '导入失败')
  } finally { importing.value = false }
}

const handleSizeChange = (val: number) => { pageSize.value = val; fetchList() }
const handlePageChange = (val: number) => { page.value = val; fetchList() }

onMounted(() => {
  fetchList()
  fetchFilterOptions()
})
</script>

<template>
  <div class="safety-stock-params-page">
    <div class="page-header">
      <h3>安全库存参数设置</h3>
      <p class="page-desc">
        以SKU为最小单位，为每个仓库×SKU设置安全库存天数范围。
        该参数是"可调天数规则"的前置依赖。
      </p>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" placeholder="搜索 SKU编码/名称/仓库" clearable style="width:260px" @clear="fetchList" @keyup.enter="fetchList" />
        <el-select v-model="filterWarehouse" placeholder="仓库筛选" clearable style="width:150px" @change="fetchList">
          <el-option v-for="w in warehouseOptions" :key="w" :label="w" :value="w" />
        </el-select>
        <el-select v-model="filterAbcType" placeholder="ABC分类" clearable style="width:120px" @change="fetchList">
          <el-option v-for="a in abcTypeOptions" :key="a" :label="a" :value="a" />
        </el-select>
        <el-button type="default" @click="fetchList">查询</el-button>
      </div>
      <div class="toolbar-right">
        <el-button type="success" @click="importDialog = true">批量导入</el-button>
        <el-button type="primary" @click="openDialog()">新增参数</el-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <el-table :data="rows" v-loading="loading" border stripe style="width:100%">
      <el-table-column prop="sku_code" label="SKU编码" width="140" />
      <el-table-column prop="sku_name" label="SKU简称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="category" label="品类" width="160" show-overflow-tooltip />
      <el-table-column prop="abc_type" label="ABC分类" width="80" align="center" />
      <el-table-column prop="warehouse" label="仓库" width="120" />
      <el-table-column prop="min_safety_days" label="最小安全天数" width="120" align="center" />
      <el-table-column prop="max_safety_days" label="最大安全天数" width="120" align="center" />
      <el-table-column prop="status" label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_time" label="更新时间" width="170" />
      <el-table-column label="操作" width="160" fixed="right">
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
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑安全库存参数' : '新增安全库存参数'" width="650px" :close-on-click-modal="false">
      <el-form :model="form" label-width="120px">
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
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="品类">
              <el-input v-model="form.category" placeholder="请输入品类" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="ABC分类">
              <el-select v-model="form.abc_type" placeholder="请选择" style="width:100%">
                <el-option label="A类" value="A类" />
                <el-option label="B类" value="B类" />
                <el-option label="C类" value="C类" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="仓库" required>
              <el-input v-model="form.warehouse" placeholder="请输入仓库名称" :disabled="!!editingId" />
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
            <el-form-item label="最小安全天数" required>
              <el-input-number v-model="form.min_safety_days" :min="0" :max="365" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最大安全天数" required>
              <el-input-number v-model="form.max_safety_days" :min="0" :max="365" style="width:100%" />
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

    <!-- 导入弹窗 -->
    <el-dialog v-model="importDialog" title="批量导入安全库存参数" width="700px">
      <el-alert type="info" :closable="false" style="margin-bottom:15px">
        请粘贴 JSON 数组格式的数据，每项包含: sku_code, sku_name, category, abc_type, warehouse, min_safety_days, max_safety_days
      </el-alert>
      <el-input v-model="importJson" type="textarea" :rows="12" placeholder='[{"sku_code":"xxx","sku_name":"xxx","warehouse":"xxx","min_safety_days":7,"max_safety_days":21}]' />
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="handleImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.safety-stock-params-page { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-header h3 { margin: 0 0 4px; font-size: 18px; }
.page-desc { margin: 0; color: #909399; font-size: 13px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar-left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
