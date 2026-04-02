<!-- 这个文件是什么作用显示的是什么：这是个人中心页面。显示/实现的是：当前登录用户的基本信息、所属部门、角色、岗位及个人账号设置。 -->
<script setup lang="ts">
/**
 * 个人中心页面
 * 展示当前登录用户的详细信息（包括部门、角色、岗位），前后端数据同步
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const loading = ref(true)
const userInfo = ref<any>(null)

// 获取当前用户的用户名
const getUsername = () => {
  try {
    const s = localStorage.getItem('currentUser')
    const user = s ? JSON.parse(s) : null
    return user ? user.username : null
  } catch {
    return null
  }
}

const fetchProfile = async () => {
  const username = getUsername()
  if (!username) {
    ElMessage.error('未获取到用户信息，请重新登录')
    router.push('/login')
    return
  }

  try {
    const res = await fetch(`http://localhost:3000/api/profile/${username}`)
    const data = await res.json()
    if (data.code === 200) {
      userInfo.value = data.data
    } else {
      ElMessage.error(data.msg || '获取个人信息失败')
    }
  } catch (err) {
    ElMessage.error('网络错误，无法获取个人信息')
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <div class="profile-container">
    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading" :size="30"><Loading /></el-icon>
      <p>加载中...</p>
    </div>

    <div v-else-if="userInfo" class="profile-layout">
      <!-- 左侧：基本信息卡片 -->
      <div class="left-panel">
        <div class="user-card">
          <div class="avatar-large">
            {{ userInfo.nickname?.slice(0, 1) || userInfo.username?.slice(0, 1) || '用' }}
          </div>
          <h2 class="user-name">{{ userInfo.nickname }}</h2>
          <p class="user-username">@{{ userInfo.username }}</p>
          
          <div class="user-tags">
            <el-tag v-if="userInfo.isSuperAdmin" type="danger" effect="dark" round>超级管理员</el-tag>
            <el-tag v-else type="primary" effect="dark" round>普通用户</el-tag>
            <el-tag :type="userInfo.status === 1 ? 'success' : 'info'" round>
              {{ userInfo.status === 1 ? '状态正常' : '已停用' }}
            </el-tag>
          </div>
        </div>

        <div class="contact-card">
          <h3 class="card-title">联系信息</h3>
          <div class="info-list">
            <div class="info-item">
              <el-icon><Phone /></el-icon>
              <div class="info-content">
                <span class="label">手机号码</span>
                <span class="value">{{ userInfo.mobile || '未填写' }}</span>
              </div>
            </div>
            <div class="info-item">
              <el-icon><Message /></el-icon>
              <div class="info-content">
                <span class="label">电子邮箱</span>
                <span class="value">{{ userInfo.email || '未填写' }}</span>
              </div>
            </div>
            <div class="info-item">
              <el-icon><Calendar /></el-icon>
              <div class="info-content">
                <span class="label">注册时间</span>
                <span class="value">{{ new Date(userInfo.createdTime).toLocaleDateString('zh-CN') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：组织架构信息 -->
      <div class="right-panel">
        <div class="org-card">
          <h3 class="card-title" style="margin-bottom: 24px;">组织权限信息</h3>
          
          <!-- 归属部门 -->
          <div class="data-group">
            <div class="group-header">
              <div class="icon-box blue"><el-icon><OfficeBuilding /></el-icon></div>
              <h4>归属部门</h4>
            </div>
            <div class="group-content">
              <div class="dept-name">{{ userInfo.departmentName }}</div>
            </div>
          </div>

          <el-divider border-style="dashed" />

          <!-- 关联岗位 -->
          <div class="data-group">
            <div class="group-header">
              <div class="icon-box amber"><el-icon><Stamp /></el-icon></div>
              <h4>关联岗位</h4>
            </div>
            <div class="group-content">
              <div v-if="userInfo.posts && userInfo.posts.length > 0" class="tag-list">
                <el-tag 
                  v-for="post in userInfo.posts" 
                  :key="post.id" 
                  size="large" 
                  type="warning" 
                  effect="plain"
                  class="custom-tag"
                >
                  {{ post.name }} <span class="tag-code">({{ post.code }})</span>
                </el-tag>
              </div>
              <div v-else class="empty-text">暂无关联岗位</div>
            </div>
          </div>

          <el-divider border-style="dashed" />

          <!-- 绑定角色 -->
          <div class="data-group">
            <div class="group-header">
              <div class="icon-box teal"><el-icon><Key /></el-icon></div>
              <h4>绑定角色</h4>
            </div>
            <div class="group-content">
              <div v-if="userInfo.roles && userInfo.roles.length > 0" class="tag-list">
                <el-tag 
                  v-for="role in userInfo.roles" 
                  :key="role.id" 
                  size="large" 
                  type="success" 
                  effect="plain"
                  class="custom-tag"
                >
                  {{ role.name }} <span class="tag-code">({{ role.code }})</span>
                </el-tag>
              </div>
              <div v-else class="empty-text">暂无绑定角色</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-container {
  padding: 24px;
  height: calc(100vh - 64px);
  overflow-y: auto;
  box-sizing: border-box;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: var(--text-muted);
}

.profile-layout {
  display: flex;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 左侧样式 */
.left-panel {
  flex: 0 0 340px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.user-card, .contact-card, .org-card {
  background: white;
  border-radius: 12px;
  padding: 32px 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.user-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.avatar-large {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-size: 36px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.4);
  border: 4px solid #eff6ff;
}

.user-name {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.user-username {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 20px 0;
}

.user-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.contact-card {
  padding: 24px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 20px 0;
  display: flex;
  align-items: center;
}

.card-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 16px;
  background: var(--primary-color);
  border-radius: 2px;
  margin-right: 8px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.info-item .el-icon {
  font-size: 18px;
  color: var(--text-muted);
  margin-top: 2px;
  background: #f1f5f9;
  padding: 8px;
  border-radius: 8px;
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-content .label {
  font-size: 12px;
  color: var(--text-muted);
}

.info-content .value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

/* 右侧样式 */
.right-panel {
  flex: 1;
}

.org-card {
  padding: 32px;
  height: 100%;
}

.data-group {
  margin: 16px 0;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: white;
}

.icon-box.blue { background: #3b82f6; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3); }
.icon-box.amber { background: #f59e0b; box-shadow: 0 4px 6px -1px rgba(245, 158, 11, 0.3); }
.icon-box.teal { background: #10b981; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3); }

.group-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.group-content {
  padding-left: 44px; /* 对齐文本 */
}

.dept-name {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  background: #f8fafc;
  padding: 12px 20px;
  border-radius: 8px;
  display: inline-block;
  border: 1px solid #e2e8f0;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.custom-tag {
  padding: 8px 16px;
  height: auto;
  font-size: 14px;
  border-radius: 6px;
}

.tag-code {
  font-size: 12px;
  opacity: 0.7;
  margin-left: 4px;
  font-family: monospace;
}

.empty-text {
  color: var(--text-muted);
  font-size: 14px;
  font-style: italic;
}
</style>
