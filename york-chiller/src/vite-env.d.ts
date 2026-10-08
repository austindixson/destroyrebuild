/// <reference types="vite/client" />

interface YorkDevApi {
  controller: import('./sim/controller').PlantController
  tools: import('./sim/tools').YorkToolbox
}

interface Window {
  __york?: YorkDevApi
}
