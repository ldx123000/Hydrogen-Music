import { defineStore } from "pinia";

export const useCloudStore= defineStore('cloudStore', {
    state: () => {
        return {
            count: null,
            size: null,
            maxSize: null,
            cloudSongs: null
        }
    },
    actions: {
        updateCloudSongs(list) {
            this.cloudSongs = list
        }
    },
})