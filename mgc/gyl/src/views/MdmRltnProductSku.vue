<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericRelation from '@/components/MdmGenericRelation.vue'

const entityName = '产品-SKU转换'
const apiPath = '/master/rltn/product-sku'

const formFields = {
  product_code: '',
  product_name: '',
  sku_code: '',
  convert_ratio: 1,
  begin_date: '',
  end_date: '',
  status: 1,
  remark: ''
}

const formRules = {
  product_code: [{ required: true, message: '生产产品编码必填', trigger: 'blur' }],
  sku_code: [{ required: true, message: '销售SKU编码必填', trigger: 'blur' }],
  convert_ratio: [{ required: true, message: '转换系数必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericRelation
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="产品/SKU编码/名称"
  >
    <template #columns>
      <el-table-column prop="product_code" label="产品编码" width="120">
        <template #default="{ row }"><span class="code-text">{{ row.product_code }}</span></template>
      </el-table-column>
      <el-table-column prop="product_name" label="产品名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="sku_code" label="SKU编码" width="120">
        <template #default="{ row }"><span class="code-text">{{ row.sku_code }}</span></template>
      </el-table-column>
      <el-table-column prop="sku_name" label="SKU名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="convert_ratio" label="转换系数" width="100" align="right" />
    </template>

    <template #form="{ form, isEdit }">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="产品编码" prop="product_code">
          <el-input v-model="form.product_code" :disabled="isEdit" placeholder="例如：PRD-001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="SKU编码" prop="sku_code">
          <el-input v-model="form.sku_code" :disabled="isEdit" placeholder="例如：SKU-P001" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="产品名称" prop="product_name">
            <el-input v-model="form.product_name" placeholder="生产端产品名称" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="转换系数" prop="convert_ratio">
            <el-input-number v-model="form.convert_ratio" :min="0.0001" :precision="4" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>
    </template>
  </MdmGenericRelation>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
