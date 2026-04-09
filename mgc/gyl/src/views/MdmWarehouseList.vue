<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericList from '@/components/MdmGenericList.vue'

const entityName = '仓库'
const apiPath = '/master/warehouse'

const formFields = {
  warehouse_code: '',
  warehouse_name: '',
  biz_warehouse_code: '',
  biz_warehouse_name: '',
  lv1_type_code: '',
  lv1_type_name: '',
  lv2_type_name: '',
  factory_code: '',
  factory_name: '',
  warehouse_type_code: '',
  is_own: 1,
  province_name: '',
  city_name: '',
  district_name: '',
  address: '',
  status: 1,
  remark: ''
}

const formRules = {
  warehouse_code: [{ required: true, message: '仓库编码必填', trigger: 'blur' }],
  warehouse_name: [{ required: true, message: '仓库名称必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericList
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="仓库编码/名称"
  >
    <template #filters="{ queryParams }">
      <el-form-item label="仓库类型">
        <el-input v-model="queryParams.lv1TypeName" placeholder="BDC/CDC/RDC" clearable style="width:110px" />
      </el-form-item>
      <el-form-item label="所属工厂">
        <el-input v-model="queryParams.factoryCode" placeholder="工厂编码" clearable style="width:110px" />
      </el-form-item>
    </template>

    <template #columns>
      <el-table-column prop="warehouse_code" label="仓库编码" width="150" fixed="left">
        <template #default="{ row }"><span class="code-text">{{ row.warehouse_code }}</span></template>
      </el-table-column>
      <el-table-column prop="warehouse_name" label="仓库名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="lv1_type_name" label="一级类型" width="100" />
      <el-table-column prop="factory_name" label="所属工厂" min-width="150" show-overflow-tooltip />
      <el-table-column prop="is_own" label="是否自有" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_own ? 'success' : 'info'" size="small">{{ row.is_own ? '自有' : '非自有' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="位置" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ [row.province_name, row.city_name, row.district_name, row.address].filter(Boolean).join(' ') || '-' }}
        </template>
      </el-table-column>
    </template>

    <template #form="{ form, isEdit }">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="仓库编码" prop="warehouse_code">
          <el-input v-model="form.warehouse_code" :disabled="isEdit" placeholder="例如：WH-CDC-001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="仓库名称" prop="warehouse_name">
            <el-input v-model="form.warehouse_name" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="一级类型" prop="lv1_type_name">
          <el-input v-model="form.lv1_type_name" placeholder="例如：CDC" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="所属工厂" prop="factory_code">
            <el-input v-model="form.factory_code" placeholder="输入工厂编码" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="是否自有" prop="is_own">
            <el-select v-model="form.is_own" style="width: 100%">
              <el-option label="自有" :value="1" />
              <el-option label="非自有" :value="0" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="8"><el-form-item label="省份" prop="province_name"><el-input v-model="form.province_name" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="城市" prop="city_name"><el-input v-model="form.city_name" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="区/县" prop="district_name"><el-input v-model="form.district_name" /></el-form-item></el-col>
      </el-row>
      <el-form-item label="详细地址" prop="address">
        <el-input v-model="form.address" />
      </el-form-item>
    </template>
  </MdmGenericList>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
