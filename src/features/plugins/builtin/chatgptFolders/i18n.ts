type Copy = {
  choose: string;
  add: string;
  export: string;
  import: string;
  added: string;
  importFailed: string;
  imported: string;
};

const copies: Record<string, Copy> = {
  en: {
    choose: 'Choose folder',
    add: 'Add current chat',
    export: 'Export JSON',
    import: 'Import JSON',
    added: 'Added to folder',
    importFailed: 'Import failed: invalid file',
    imported: 'Import complete',
  },
  zh: {
    choose: '选择文件夹',
    add: '加入当前对话',
    export: '导出 JSON',
    import: '导入 JSON',
    added: '已加入文件夹',
    importFailed: '导入失败：文件格式无效',
    imported: '导入成功',
  },
  zh_TW: {
    choose: '選擇資料夾',
    add: '加入目前對話',
    export: '匯出 JSON',
    import: '匯入 JSON',
    added: '已加入資料夾',
    importFailed: '匯入失敗：檔案格式無效',
    imported: '匯入成功',
  },
  ja: {
    choose: 'フォルダーを選択',
    add: '現在の会話を追加',
    export: 'JSON をエクスポート',
    import: 'JSON をインポート',
    added: 'フォルダーに追加しました',
    importFailed: 'インポート失敗: 無効なファイル',
    imported: 'インポート完了',
  },
  ko: {
    choose: '폴더 선택',
    add: '현재 채팅 추가',
    export: 'JSON 내보내기',
    import: 'JSON 가져오기',
    added: '폴더에 추가됨',
    importFailed: '가져오기 실패: 잘못된 파일',
    imported: '가져오기 완료',
  },
  fr: {
    choose: 'Choisir un dossier',
    add: 'Ajouter ce chat',
    export: 'Exporter JSON',
    import: 'Importer JSON',
    added: 'Ajouté au dossier',
    importFailed: 'Importation échouée : fichier invalide',
    imported: 'Importation terminée',
  },
  es: {
    choose: 'Elegir carpeta',
    add: 'Añadir chat actual',
    export: 'Exportar JSON',
    import: 'Importar JSON',
    added: 'Añadido a la carpeta',
    importFailed: 'Error al importar: archivo no válido',
    imported: 'Importación completada',
  },
  pt: {
    choose: 'Escolher pasta',
    add: 'Adicionar conversa atual',
    export: 'Exportar JSON',
    import: 'Importar JSON',
    added: 'Adicionado à pasta',
    importFailed: 'Falha na importação: arquivo inválido',
    imported: 'Importação concluída',
  },
  ru: {
    choose: 'Выбрать папку',
    add: 'Добавить текущий чат',
    export: 'Экспорт JSON',
    import: 'Импорт JSON',
    added: 'Добавлено в папку',
    importFailed: 'Ошибка импорта: неверный файл',
    imported: 'Импорт завершён',
  },
  ar: {
    choose: 'اختر مجلدًا',
    add: 'أضف المحادثة الحالية',
    export: 'تصدير JSON',
    import: 'استيراد JSON',
    added: 'أُضيفت إلى المجلد',
    importFailed: 'فشل الاستيراد: ملف غير صالح',
    imported: 'اكتمل الاستيراد',
  },
};

export function getChatGptFolderCopy(language = navigator.language): Copy {
  const normalized = language.replace('-', '_');
  if (/^zh_(TW|HK|MO)/i.test(normalized)) return copies.zh_TW;
  return copies[normalized.split('_')[0]] ?? copies.en;
}
