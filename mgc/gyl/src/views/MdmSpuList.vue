<script setup lang="ts">
import MdmGenericList from '@/components/MdmGenericList.vue'

const entityName = '标准商品SPU'
const apiPath = '/master/spu'

const formFields = {
  spu_code: '',
  spu_name: '',
  category_code: '',
  category_name: '',
  product_line: '',
  milk_source: '',
  process_type: '',
  origin_region: '',
  storage_type: '',
  shelf_life_days: 0,
  brand_name: '认养一头牛',
  lifecycle_status: 'ACTIVE',
  status: 1,
  remark: ''
}

const formRules = {
  spu_code: [{ required: true, message: 'SPU编码必填', trigger: 'blur' }],
  spu_name: [{ required: true, message: 'SPU名称必填', trigger: 'blur' }],
  category_code: [{ required: true, message: '品类编码必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericList
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="SPU编码/名称/品类/工艺"
  >
    <template #filters="{ queryParams }">
      <el-form-item label="品类编码">
        <el-input v-model="queryParams.categoryCode" placeholder="如 CAT-L3-UHT" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="产品线">
        <el-input v-model="queryParams.productLine" placeholder="液态奶/酸奶/奶粉" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="生命周期">
        <el-select v-model="queryParams.lifecycleStatus" placeholder="全部" clearable style="width: 120px">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="INACTIVE" />
        </el-select>
      </el-form-item>
    </template>

    <template #columns>
      <el-table-column prop="spu_code" label="SPU编码" width="180" fixed="left">
        <template #default="{ row }"><span class="code-text">{{ row.spu_code }}</span></template>
      </el-table-column>
      <el-table-column prop="spu_name" label="SPU名称" min-width="180" show-overflow-tooltip />
      <el-table-column label="品类" min-width="190" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="category-cell">
            <span>{{ row.category_name || '-' }}</span>
            <small>{{ row.category_code || '-' }}</small>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="product_line" label="产品线" width="130" />
      <el-table-column label="工艺/奶源" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          {{ [row.process_type, row.milk_source].filter(Boolean).join(' / ') || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="origin_region" label="来源区域" width="120" show-overflow-tooltip />
      <el-table-column prop="storage_type" label="贮存" width="90" />
      <el-table-column prop="shelf_life_days" label="保质期(天)" width="105" align="right" />
      <el-table-column label="关联SKU" width="110" align="center">
        <template #default="{ row }">
          <el-tooltip
            :content="row.representative_sku_code ? `代表SKU：${row.representative_sku_code}` : '暂无匹配SKU'"
            placement="top"
          >
            <el-tag type="primary" effect="plain" size="small">
              {{ row.active_sku_count ?? row.sku_count ?? 0 }}/{{ row.sku_count ?? 0 }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="representative_sku_name" label="代表SKU" min-width="180" show-overflow-tooltip />
      <el-table-column prop="lifecycle_status" label="生命周期" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.lifecycle_status === 'ACTIVE' ? 'success' : 'info'" size="small">
            {{ row.lifecycle_status === 'ACTIVE' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
    </template>

    <template #form="{ form, isEdit }">
      <el-alert
        title="SPU只维护标准商品口径，不会批量回填或覆盖现有SKU编码、库存与业务单据。"
        type="info"
        show-icon
        :closable="false"
        class="spu-alert"
      />
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="SPU编码" prop="spu_code">
            <el-input v-model="form.spu_code" :disabled="isEdit" placeholder="例如：SPU-UHT-PURE" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="SPU名称" prop="spu_name">
            <el-input v-model="form.spu_name" placeholder="例如：常温纯牛奶" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="品类编码" prop="category_code">
            <el-input v-model="form.category_code" placeholder="例如：CAT-L3-UHT" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="品类名称" prop="category_name">
            <el-input v-model="form.category_name" placeholder="可留空由系统按品类编码补齐" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="产品线" prop="product_line">
            <el-input v-model="form.product_line" placeholder="液态奶/酸奶/奶粉/特殊地域乳制品" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="品牌" prop="brand_name">
            <el-input v-model="form.brand_name" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="奶源" prop="milk_source">
            <el-input v-model="form.milk_source" placeholder="牛奶/牦牛奶/发酵乳" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="加工工艺" prop="process_type">
            <el-input v-model="form.process_type" placeholder="UHT灭菌/巴氏杀菌/发酵" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="来源区域" prop="origin_region">
            <el-input v-model="form.origin_region" placeholder="全国/藏区/高加索" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="贮存方式" prop="storage_type">
            <el-input v-model="form.storage_type" placeholder="常温/冷藏" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="保质期" prop="shelf_life_days">
            <el-input-number v-model="form.shelf_life_days" :min="0" :step="1" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="生命周期" prop="lifecycle_status">
        <el-select v-model="form.lifecycle_status" style="width: 100%">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="INACTIVE" />
        </el-select>
      </el-form-item>
    </template>
  </MdmGenericList>
</template>

<style scoped>
.code-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  color: #0f6cbd;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.category-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.category-cell small {
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}

.spu-alert {
  margin-bottom: 14px;
}
</style>
