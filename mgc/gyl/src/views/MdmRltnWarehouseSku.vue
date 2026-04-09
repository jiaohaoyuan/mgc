<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericRelation from '@/components/MdmGenericRelation.vue'

const entityName = '仓库-SKU'
const apiPath = '/master/rltn/warehouse-sku'

const formFields = {
  warehouse_code: '',
  sku_code: '',
  begin_date: '',
  end_date: '',
  status: 1,
  remark: ''
}

const formRules = {
  warehouse_code: [{ required: true, message: '仓库编码必填', trigger: 'blur' }],
  sku_code: [{ required: true, message: 'SKU编码必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericRelation
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="仓库/SKU编码/名称"
  >
    <template #columns>
      <el-table-column prop="warehouse_code" label="仓库编码" width="120">
        <template #default="{ row }"><span class="code-text">{{ row.warehouse_code }}</span></template>
      </el-table-column>
      <el-table-column prop="warehouse_name" label="仓库名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="sku_code" label="SKU编码" width="120">
        <template #default="{ row }"><span class="code-text">{{ row.sku_code }}</span></template>
      </el-table-column>
      <el-table-column prop="sku_name" label="SKU名称" min-width="180" show-overflow-tooltip />
    </template>

    <template #form="{ form, isEdit }">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="仓库编码" prop="warehouse_code">
          <el-input v-model="form.warehouse_code" :disabled="isEdit" placeholder="例如：WH-CDC-001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="SKU编码" prop="sku_code">
          <el-input v-model="form.sku_code" :disabled="isEdit" placeholder="例如：SKU-P001" />
          </el-form-item>
        </el-col>
      </el-row>
    </template>
  </MdmGenericRelation>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
