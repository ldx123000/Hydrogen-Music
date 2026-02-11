<script setup>
  import { ref } from 'vue'
  import Banner from '../components/Banner.vue'
  import BreakingNewsDetailModal from '../components/BreakingNewsDetailModal.vue'
  import Recommendation from '../components/Recommendation.vue';
  import NewestSong from '../components/NewestSong.vue';
  import RecList from '../components/RecList.vue';
  import { useUserStore } from '../store/userStore';

  const userStore = useUserStore()
  const breakingNewsVisible = ref(false)
  const activeBreakingNews = ref(null)

  const openBreakingNews = payload => {
    if (!payload) return
    activeBreakingNews.value = payload
    breakingNewsVisible.value = true
  }

  const closeBreakingNews = () => {
    breakingNewsVisible.value = false
    activeBreakingNews.value = null
  }
</script>

<template>
  <div class="home-page" v-if="userStore.homePage">
    <div class="page-header">
      <Banner class="banner" @open-breaking-news="openBreakingNews"></Banner>
      <Recommendation class="recommendation"></Recommendation>
      <NewestSong class="newest-song"></NewestSong>
    </div>
    <div class="page-content">
      <RecList class="rec-list"></RecList>
    </div>
    <BreakingNewsDetailModal :visible="breakingNewsVisible" :banner="activeBreakingNews" @close="closeBreakingNews"></BreakingNewsDetailModal>
  </div>
</template>

<style scoped lang="scss">
  .home-page{
    height: 100%;
    display: flex;
    flex-direction: column;
    .page-header{
      padding-top: 2.8vw;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
    }
    .page-content{
      margin-top: 40px;
      .rec-list{
        margin-bottom: 140px;
      }
    }
  }
</style>
