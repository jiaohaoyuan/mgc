<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericList from '@/components/MdmGenericList.vue'

const entityName = '工厂'
const apiPath = '/master/factory'

const formFields = {
  factory_code: '',
  factory_name: '',
  company_name: '',
  type_name: '',
  is_own: 1,
  province_name: '',
  city_name: '',
  district_name: '',
  address: '',
  status: 1,
  remark: ''
}

const formRules = {
  factory_code: [{ required: true, message: '工厂编码必填', trigger: 'blur' }],
  factory_name: [{ required: true, message: '工厂名称必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericList
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="工厂编码/名称"
  >
    <template #filters="{ queryParams }">
      <el-form-item label="是否自有">
        <el-select v-model="queryParams.isOwn" placeholder="全部" clearable style="width:110px">
          <el-option label="自有" value="1" />
          <el-option label="非自有" value="0" />
        </el-select>
      </el-form-item>
    </template>

    <template #columns>
      <el-table-column prop="factory_code" label="工厂编码" width="150" fixed="left">
        <template #default="{ row }"><span class="code-text">{{ row.factory_code }}</span></template>
      </el-table-column>
      <el-table-column prop="factory_name" label="工厂名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="company_name" label="所属公司" min-width="150" show-overflow-tooltip />
      <el-table-column prop="type_name" label="工厂类型" width="120" />
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
          <el-form-item label="工厂编码" prop="factory_code">
          <el-input v-model="form.factory_code" :disabled="isEdit" placeholder="例如：FAC-001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="工厂名称" prop="factory_name">
            <el-input v-model="form.factory_name" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="所属公司" prop="company_name">
            <el-input v-model="form.company_name" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="工厂类型" prop="type_name">
            <el-input v-model="form.type_name" />
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
