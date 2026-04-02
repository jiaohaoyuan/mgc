<!-- 这个文件是什么作用显示的是什么：这是品类管理页面。显示/实现的是：商品品类的列表、添加、编辑和删除等管理界面。 -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { SetUp, Monitor, FirstAidKit, Dish } from '@element-plus/icons-vue'

const API_BASE = 'http://localhost:3000/api'
const products = ref<any[]>([])
const loading = ref(false)
const searchQuery = ref('')
const filterType = ref('All')

const fetchProducts = async () => {
  loading.value = true
  try {
    const res = await axios.get(`${API_BASE}/products`)
    if (res.data.code === 200) {
      products.value = res.data.data.map((p: any) => ({
        id: p.id,
        code: p.product_code,
        name: p.product_name,
        type: p.material_type, // 'LowTemp', 'Normal'
        shelfLife: parseInt(p.shelf_life),
        createTime: p.create_time
      }))
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (err) {
    ElMessage.error('获取品类数据失败，请检查服务是否开启')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchProducts()
})

const filteredProducts = computed(() => {
  let list = products.value
  if (filterType.value !== 'All') {
    list = list.filter(p => p.type === filterType.value)
  }
  if (searchQuery.value) {
    list = list.filter(p => p.name.includes(searchQuery.value) || p.code.includes(searchQuery.value))
  }
  return list
})

const getTypeProps = (type: string) => {
  if (type === 'LowTemp') {
    return { label: '低温鲜奶', tag: 'primary', icon: Monitor }
  }
  return { label: '常温品类', tag: 'warning', icon: Dish }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">
        <el-icon><SetUp /></el-icon> SKU品类物资总览库
      </div>
      <div class="page-actions">
        <el-input 
          v-model="searchQuery" 
          placeholder="探索全量款 SKU 或品名名..." 
          style="width: 250px; margin-right: 16px" 
          prefix-icon="Search" 
          clearable 
        />
        <el-radio-group v-model="filterType">
          <el-radio-button value="All">全部系列 ({{ products.length }})</el-radio-button>
          <el-radio-button value="LowTemp">短保低温组</el-radio-button>
          <el-radio-button value="Normal">常规长保组</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 数据表 -->
    <div class="page-card">
      <el-table :data="filteredProducts.slice(0, 100)" style="width: 100%" border stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="code" label="SKU 识别码" width="180">
          <template #default="{ row }">
            <span style="font-family: monospace; color: #475569;">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="市场流转品名" min-width="260">
          <template #default="{ row }">
            <div style="font-weight: 500; font-size: 14px; color: #1e293b;">
               {{ row.name }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="贮存属性归类" width="180" align="center">
          <template #default="{ row }">
            <el-tag :type="getTypeProps(row.type).tag" effect="light" size="large">
              <el-icon style="margin-right: 4px"><component :is="getTypeProps(row.type).icon" /></el-icon>
              {{ getTypeProps(row.type).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="shelfLife" label="生命周期基准 (保质期)" min-width="180" align="center">
          <template #default="{ row }">
            <span style="font-weight: 600; font-family: monospace; font-size: 14px" :style="{ color: row.type === 'LowTemp' ? '#38bdf8' : '#eab308' }">
              {{ row.shelfLife }} 天
            </span>
          </template>
        </el-table-column>
      </el-table>
      <div style="padding: 12px; font-size: 12px; color: #94a3b8; text-align: center;">由于页面性能，已对本地结果做了防卡顿切片，最多同时展示 100 条</div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.page-card {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
</style>
