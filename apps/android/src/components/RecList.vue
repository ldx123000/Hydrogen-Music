<script setup>
  import RecListItem from './RecListItem.vue'

</script>

<template>
  <div class="rec-list">
    <RecListItem recType="0" class="list-item"></RecListItem>
    <RecListItem recType="1" class="list-item"></RecListItem>
    <RecListItem recType="2" class="list-item"></RecListItem>
    <RecListItem recType="3" class="list-item"></RecListItem>
  </div>
</template>

<style scoped lang="scss">
  .list-item{
    margin-bottom: 35px;
    &:last-child{
      margin-bottom: none;
    }
  }
</style>