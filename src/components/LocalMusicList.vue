<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import ChildrenFolder from '../components/ChildrenFolder.vue'
  import LocalMusicClassify from '../components/LocalMusicClassify.vue'
  import { useLibraryStore } from '../store/libraryStore';
  import { storeToRefs } from 'pinia';
  const router = useRouter()
  const libraryStore = useLibraryStore()
  const { listType1, listType2 } = storeToRefs(libraryStore)
  const props = defineProps(['folderlist', 'classifylist', 'type'])
  const openChildren = (item) => {
    if(item.show) item.show = false
    else item.show = true
  }
  const showFiles = (item) => {
    router.push({name: 'localFiles', query: {name: item.name, type: props.type}})
  }
</script>

<template>
  <div class="local-music-list">
    <div class="list-container">
      <div class="list-folder" v-show="listType1 == 3 && listType2 == 0 || listType1 == 2 && listType2 == 1">
        <div class="list-item" @click.stop="showFiles(item)" :class="{'list-item-open': item.show && item.children.length != 0, 'list-item-selected': router.currentRoute.value.query.name == item.name}" v-for="(item, index) in props.folderlist">
          <div class="folder">
            <div class="folder-img">
              <svg t="1671777626561" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2336" width="200" height="200"><path d="M418.133333 298.666667l-42.666666-42.666667H213.333333v512h640V298.666667H418.133333zM896 298.666667v512H170.666667V213.333333h226.133333l42.666667 42.666667H896v42.666667z m-298.666667 341.333333h170.666667v42.666667h-170.666667v-42.666667z" fill="#000000" p-id="2337"></path></svg>
            </div>
            <div class="folder-name">
              <span class="name">{{ item.name }}</span>
            </div>
            <div class="folder-more" @click.stop="openChildren(item)" :class="{'folder-more-open': item.show}" v-if="item.children.length != 0">
                <svg t="1671783136987" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3068" width="200" height="200"><path d="M533.333333 605.866667L341.333333 413.866667l29.866667-29.866667 162.133333 162.133333L695.466667 384l29.866666 29.866667-192 192z" fill="#000000" p-id="3069"></path></svg>
            </div>
          </div>
          <Transition name="children">
            <div class="children-folder" v-if="item.children.length != 0" v-show="item.show">
              <ChildrenFolder :folderChildren="item.children" :type="props.type"></ChildrenFolder>
            </div>
          </Transition>
        </div>
      </div>
      <div class="list-albums" v-if="props.type == 'local'" v-show="listType1 == 3 && listType2 == 1">
        <LocalMusicClassify :classifyData="props.classifylist.albums"></LocalMusicClassify>
      </div>
      <div class="list-artists" v-if="props.type == 'local'" v-show="listType1 == 3 && listType2 == 2">
        <LocalMusicClassify :classifyData="props.classifylist.artists"></LocalMusicClassify>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
  .local-music-list{
    width: 100%;
    height: 100%;
    .list-container{
      width: 100%;
      height: 100%;
      .list-folder{
        display: flex;
        flex-direction: column;
        .list-item-open{
          background-color: rgba(0, 0, 0, 0.02);
        }
        .list-item-selected{
          background-color: rgba(0, 0, 0, 0.05) !important;
          box-shadow: inset 0 0 0 0.5Px black;
        }
        .list-item{
          padding: 8Px;
          overflow: hidden;
          &:hover{
            cursor: pointer;
            background-color: rgba(0, 0, 0, 0.02);
          }
          .folder{
            display: flex;
            flex-direction: row;
            align-items: center;
            .folder-img{
              margin-right: 10Px;
              width: 30Px;
              height: 30Px;
              svg{
                width: 100%;
                height: 100%;
              }
            }
            .folder-name{
              width: calc(100% - 75Px);
              .name{
                font: 14Px SourceHanSansCN-Bold;
                color: black;
                text-align: left;
                overflow: hidden;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 1;
                word-break: break-all;
              }
            }
            .folder-more{
              width: 35Px;
              height: 35Px;
              transition: 0.2s;
              opacity: 0.6;
              &:hover{
                opacity: 1;
                transition: 0.3s;
              }
              svg{
                  width: 100%;
                  height: 100%;
              }
            }
            .folder-more-open{
                transform: rotate(180deg);
            }
          }
          .children-enter-active,
          .children-leave-active {
            transition: 0.1s;
          }

          .children-enter-from,
          .children-leave-to {
            transform: scale(0.95);
            opacity: 0;
          }
        }
      }
      .list-albums, .list-artists{
        height: 100%;
      }
    }
  }
</style>