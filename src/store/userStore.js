import { defineStore } from "pinia";

export const useUserStore = defineStore('userStore', {
    state: () => {
        return {
            user: null,
            loginMode: null,
            likelist: null,
            favoritePlaylistId: null,
            favoritePlaylistName: null,
            appOptionShow: false,
            biliUser: null,
            homePage: true,
            cloudDiskPage: true,
            personalFMPage: true,
            sirenPage: false,
        }
    },
    actions: {
        updateUser(userinfo) {
            this.user = userinfo
        },
        resetAccountState() {
            this.user = null
            this.loginMode = null
            this.likelist = null
            this.favoritePlaylistId = null
            this.favoritePlaylistName = null
            this.appOptionShow = false
        },
        clearBiliAccountState() {
            this.biliUser = null
        },
        updateLikelist(likelist) {
            this.likelist = Array.isArray(likelist) ? likelist : []
        },
        updateFavoritePlaylistId(playlistId) {
            this.favoritePlaylistId = playlistId
        },
        updateFavoritePlaylistName(playlistName) {
            this.favoritePlaylistName = playlistName
        },
        updateFavoritePlaylistMeta(playlist = null) {
            this.favoritePlaylistId = playlist?.id ?? null
            this.favoritePlaylistName = playlist?.name ?? null
        }
    },
    persist: {
        storage: localStorage,
        pick: ['user','biliUser','homePage','cloudDiskPage','personalFMPage','sirenPage','favoritePlaylistId','favoritePlaylistName']
    },
})
