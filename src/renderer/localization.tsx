import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export const SUPPORTED_APP_LOCALES = ['zh-CN', 'en-US'] as const

export type AppLocale = typeof SUPPORTED_APP_LOCALES[number]

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN'

type MessageParams = Record<string, string | number | boolean | null | undefined>

const exactEnglishTextTranslations: Record<string, string> = {
  '查词设置': 'Search',
  '配置查词行为与释义显示': 'Configure search behavior and definition display',
  '复习设置': 'Review',
  '配置复习模式、发音与标签策略': 'Configure review modes, pronunciation, and tag strategy',
  '阅读设置': 'Reading',
  '配置辅助精读法阅读相关选项': 'Configure guided intensive-reading options',
  '通用设置': 'General',
  '配置界面语言、版本与应用行为': 'Configure language, version, and app behavior',
  '检查版本并前往下载页面': 'Check versions and open the download page',
  '英文': 'English',
  '中文': 'Chinese',
  '双语': 'Bilingual',
  '阅读理解': 'Reading Comprehension',
  '听力理解': 'Listening Comprehension',
  '口语检测': 'Speaking Check',
  '拼写检测': 'Spelling Check',
  '听写检测': 'Dictation Check',
  '确认': 'Confirm',
  '确定': 'Confirm',
  '取消': 'Cancel',
  '提示': 'Notice',
  '好的': 'OK',
  '删除': 'Delete',
  '编辑': 'Edit',
  '保存': 'Save',
  '保存中...': 'Saving...',
  '处理中...': 'Processing...',
  '收藏': 'Favorite',
  '取消收藏': 'Unfavorite',
  '归档': 'Archive',
  '取消归档': 'Unarchive',
  '管理标签': 'Manage Tags',
  '添加/编辑笔记': 'Add/Edit Note',
  '编辑笔记': 'Edit Note',
  '查看例句': 'View Examples',
  '朗读例句': 'Read Example Aloud',
  '播放发音': 'Play Pronunciation',
  '英式发音': 'UK Pronunciation',
  '美式发音': 'US Pronunciation',
  '再次发音': 'Play Again',
  '更多操作': 'More Actions',
  '管理词条': 'Manage Entry',
  '管理卡片': 'Manage Card',
  '编辑卡片': 'Edit Card',
  '删除卡片': 'Delete Card',
  '手动录入卡片': 'Manual Card',
  '编辑手动录入卡片': 'Edit Manual Card',
  '保存修改': 'Save Changes',
  '保存为卡片': 'Save as Card',
  '知道了': 'Got It',
  '保存失败': 'Save Failed',
  '输入英文单词并查询释义': 'Enter an English word to search definitions',
  '输入名称，回车创建': 'Enter a name and press Enter',
  '输入新标签名称...': 'Enter a new tag name...',
  '添加笔记...': 'Add a note...',
  '添加词条笔记...': 'Add an entry note...',
  '可输入单词、短语或句子': 'Enter a word, phrase, or sentence',
  '输入这条内容对应的中文翻译': 'Enter the Chinese translation for this content',
  '输入这条内容对应的英文翻译': 'Enter the English translation for this content',
  '可选；会作为这条释义卡片的笔记显示': 'Optional; shown as the note for this sense card',
  '输入这句英文例句': 'Enter this English example',
  '输入这句例句对应的中文翻译': 'Enter the Chinese translation for this example',
  '添加一句': 'Add Example',
  '批量添加标签': 'Add Tags in Batch',
  '批量删除标签': 'Remove Tags in Batch',
  '添加标签': 'Add Tags',
  '删除标签': 'Remove Tags',
  '创建标签失败，请重试': 'Failed to create tag. Please try again.',
  '请至少选择一个标签': 'Select at least one tag.',
  '批量标签操作失败，请重试': 'Batch tag operation failed. Please try again.',
  '词条卡': 'Entry Card',
  '释义卡': 'Sense Card',
  '释义': 'Sense',
  '词条': 'Entry',
  '归档并跳过当前复习项': 'Archive and skip the current review item',
  '归档中...': 'Archiving...',
  '不知道 1': 'Forgot 1',
  '模糊 2': 'Unsure 2',
  '知道 3': 'Know 3',
  '快捷键: 1': 'Shortcut: 1',
  '快捷键: 2': 'Shortcut: 2',
  '快捷键: 3': 'Shortcut: 3',
  '点击跳转查词': 'Click to search this entry',
  '本次跳过': 'Skip This Time',
  '参与复习': 'Review This Time',
  '输入听到的英文内容...': 'Enter the English content you heard...',
  '输入英文原文...': 'Enter the original English...',
  '无法访问麦克风，请检查权限设置': 'Cannot access the microphone. Check permission settings.',
  '开始录音': 'Start Recording',
  '停止录音': 'Stop Recording',
  '正在录音... (点击结束)': 'Recording... (click to stop)',
  '点击重新录制': 'Click to record again',
  '点击录音': 'Click to record',
  '重播例句': 'Replay Example',
  '重播笔记': 'Replay Note',
  '输入文本': 'Input Text',
  '标记生词': 'Mark New Words',
  '查词选义': 'Look Up Senses',
  '乱序中文释义': 'Shuffled Chinese Definitions',
  '单词学习': 'Word Study',
  '批量处理': 'Batch Actions',
  '未命名阅读': 'Untitled Reading',
  '时间未知': 'Unknown Time',
  '加载释义失败': 'Failed to load definitions',
  '查词失败': 'Search failed',
  '操作失败': 'Operation Failed',
  '收藏标签不存在': 'Favorite tag does not exist',
  '归档标签不存在': 'Archive tag does not exist',
  '更新词条收藏失败，请重试': 'Failed to update entry favorite. Please try again.',
  '更新词条归档失败，请重试': 'Failed to update entry archive. Please try again.',
  '保存词条笔记失败，请重试': 'Failed to save entry note. Please try again.',
  '删除词条笔记失败，请重试': 'Failed to delete entry note. Please try again.',
  '重定向失败': 'Redirect failed',
  '重新输入文本': 'Re-enter Text',
  '重新输入': 'Re-enter',
  '切换阅读记录': 'Switch Reading Record',
  '继续切换': 'Switch Anyway',
  '删除阅读历史': 'Delete Reading History',
  '批量收藏失败，请重试': 'Batch favorite failed. Please try again.',
  '批量添加标签失败，请重试': 'Batch tag add failed. Please try again.',
  '点击正文单词后可改搜词条': 'Click a word in the text to search another entry',
  '输入新的词形或原形': 'Enter another form or lemma',
  '收起详情': 'Collapse Details',
  '展开详情': 'Expand Details',
  '收起': 'Collapse',
  '展开': 'Expand',
  '选为本文义项': 'Use for This Text',
  '取消本文义项': 'Remove from This Text',
  '改选为本文义项': 'Replace Sense for This Text',
  '全选': 'Select All',
  '取消全选': 'Deselect All',
  '请输入或粘贴要阅读的英文原文': 'Enter or paste the English text to read',
  '返回当前进度': 'Return to Progress',
  '开始阅读': 'Start Reading',
  '第一遍': 'First Pass',
  '第一遍读完之后': 'After the First Pass',
  '第二遍': 'Second Pass',
  '第三遍': 'Third Pass',
  '第四遍': 'Fourth Pass',
  '第五遍': 'Fifth Pass',
  '第六遍': 'Sixth Pass',
  '第七遍': 'Seventh Pass',
  '第七遍读完之后': 'After the Seventh Pass',
  '后退': 'Back',
  '前进': 'Forward',
  '返回查词页': 'Back to Search',
  '返回应用': 'Back to App',
  '导入流程': 'Import Flow',
  '开发模式：切换显示词典导入初始流程': 'Development: toggle dictionary import setup',
  '开发模式：开启后复习结果不会写入 FSRS': 'Development: review results will not be written to FSRS when enabled',
  '调试FSRS: 不写入': 'Debug FSRS: no writes',
  '调试FSRS: 正常': 'Debug FSRS: normal',
  '本次发布未填写更新内容。': 'No release notes were provided for this release.',
  '未知错误': 'Unknown error',
  '当前环境无法检查更新': 'Updates Cannot Be Checked in This Environment',
  '检查更新失败': 'Update Check Failed',
  '已是最新版本': 'Already Up to Date',
  '发现新版本': 'New Version Available',
  '前往下载': 'Download',
  '稍后': 'Later',
  '打开下载页面失败': 'Failed to Open Download Page',
  '无法打开 GitHub Releases 页面，请稍后再试。': 'Could not open the GitHub Releases page. Please try again later.',
  '请先选择 MDX 词典文件': 'Select an MDX dictionary file first',
  '当前仅支持指定的牛津双解 MDX 词典文件，请重新选择':
    'Only the specified Oxford bilingual MDX dictionary file is supported. Please select it again.',
  '准备导入...': 'Preparing import...',
  '导入失败': 'Import failed',
  '查看 CSV 导入字段说明': 'View CSV import field help',
  '删除词条': 'Delete Entry',
  '删除手动录入卡片失败': 'Failed to delete manual card',
  '删除手动录入词条失败': 'Failed to delete manual entry',
  '加载词条失败': 'Failed to load entry',
  '更新词条收藏失败': 'Failed to update entry favorite',
  '更新词条归档失败': 'Failed to update entry archive',
  '保存词条笔记失败': 'Failed to save entry note',
  '删除词条笔记失败': 'Failed to delete entry note',
  '请输入英文内容': 'Enter English content',
  '请输入中文内容': 'Enter Chinese content',
  '例句格式无效': 'Invalid example format',
  '英文内容不能为空': 'English content cannot be empty',
  '中文内容不能为空': 'Chinese content cannot be empty',
  '手动录入词条不存在': 'The manual entry does not exist',
  '仅支持编辑手动录入的释义卡片': 'Only manually entered sense cards can be edited',
  '手动录入释义不存在': 'The manually entered sense does not exist',
  '已有相同英文内容的手动录入词条，当前暂不支持直接合并，请修改为其他英文内容': 'A manual entry with the same English content already exists. Direct merging is not supported yet; use different English content.',
  '仅支持删除手动录入的释义卡片': 'Only manually entered sense cards can be deleted',
  '仅支持删除手动录入词条': 'Only manually entered entries can be deleted',
  '开发环境不读取线上更新源，请打包安装后再检查更新。': 'The development environment does not read the online update source. Check again from an installed build.',
  '缺少可编辑的卡片数据': 'Missing editable card data',
  '当前应用未加载编辑功能，请重启应用后再试': 'Editing is not loaded. Restart the app and try again.',
  '设置': 'Settings',
  '查词': 'Search',
  '我的': 'Mine',
  '复习': 'Review',
  '阅读': 'Reading',
  '检查中...': 'Checking...',
  '检查更新': 'Check for Updates',
  '请选择复习模式': 'Select a review mode',
  '请选择标签': 'Select a tag',
  '删除此配置': 'Delete this configuration',
  '添加配置': 'Add configuration',
  '请先创建至少一个标签': 'Create at least one tag first',
  '释义语言模式': 'Definition Language Mode',
  '选择词条详情页显示的语言组合': 'Choose which languages to show on entry detail pages',
  '查词时自动发音': 'Auto-play pronunciation when searching',
  '进入词条详情页时自动播放发音': 'Play pronunciation automatically when opening entry details',
  '自动发音口音': 'Auto-play Accent',
  '选择自动播放的发音口音': 'Choose the pronunciation accent for auto-play',
  '英音': 'UK',
  '美音': 'US',
  '标签复习模式': 'Tag Review Modes',
  '配置不同标签对应的复习模式。例如：将「听不懂」设置为「听力理解」。': 'Map tags to review modes. For example, map a listening-related tag to Listening Comprehension.',
  '暂无配置，点击左下角 + 添加': 'No configurations yet. Click + at the lower left to add one.',
  '打开卡片时自动发音': 'Auto-play pronunciation when opening cards',
  '切换到新卡片时自动播放词条发音': 'Play entry pronunciation automatically when switching to a new card',
  '选择阅读查词和选义列表显示的语言组合': 'Choose which languages to show in reading lookup and selected-sense lists',
  '点击查词时自动发音': 'Auto-play pronunciation when looking up words',
  '点击原文单词查词时自动播放词条发音': 'Play entry pronunciation automatically when clicking a word in the text',
  '检查软件更新': 'Check Software Updates',
  '全部条目': 'All Items',
  '笔记': 'Notes',
  '手动录入': 'Manual Entries',
  '标签': 'Tags',
  '暂无标签': 'No tags',
  '导入 CSV': 'Import CSV',
  'CSV 导入字段说明': 'CSV Import Field Help',
  'FenyiDic 导出的 CSV：': 'CSV exported by FenyiDic:',
  'front、back、definition、definition_cn、grammar、examples 等内容列主要用于 Anki 或人工查看，导入时不覆盖词典释义。': 'Content columns such as front, back, definition, definition_cn, grammar, and examples are mainly for Anki or manual review; importing does not overwrite dictionary definitions.',
  '导出 CSV': 'Export CSV',
  '加入收藏': 'Add to Favorites',
  '进行归档': 'Archive',
  '加载中...': 'Loading...',
  '没有匹配的记录': 'No matching records',
  '该义项暂无中文释义': 'This sense has no Chinese definition yet',
  '普通 CSV：': 'Plain CSV:',
  '会读取 note_type、word_id、sense_id、sense_index、tags、favorite、archived、note，用于还原条目类型、标签、收藏、归档和笔记。': 'Reads note_type, word_id, sense_id, sense_index, tags, favorite, archived, and note to restore item type, tags, favorites, archive state, and notes.',
  '如果找不到单词列，会询问是否使用第一列作为单词列。': 'If no word column is found, the app will ask whether to use the first column as the word column.',
  '导出失败': 'Export Failed',
  '请先选择要导出的项目': 'Select items to export first.',
  '收藏标签不存在，请重启应用后重试': 'Favorite tag does not exist. Restart the app and try again.',
  '批量收藏': 'Favorite in Batch',
  '批量归档': 'Archive in Batch',
  '请重试': 'Please try again.',
  '归档标签不存在，请重启应用后重试': 'Archive tag does not exist. Restart the app and try again.',
  '保存笔记失败，请重试': 'Failed to save note. Please try again.',
  '文件内容太少': 'File content is too short.',
  '列匹配': 'Column Matching',
  '使用第一列': 'Use First Column',
  '未找到有效数据': 'No valid data found.',
  '导入完成': 'Import Complete',
  '导入出错': 'Import Error',
  '删除笔记': 'Delete Note',
  '操作出错': 'Operation Error',
  '取消批量管理': 'Cancel Batch Mode',
  '批量管理': 'Batch Mode',
  '确定要删除这个手动录入词条及其全部释义卡片吗？\n删除后无法恢复。': 'Delete this manual entry and all of its sense cards?\nThis cannot be undone.',
  '确定要删除这张手动录入释义卡片吗？\n删除后无法恢复。': 'Delete this manual sense card?\nThis cannot be undone.',
  '重新输入会清空当前阅读进度，包括已标记单词和已选释义。确认继续？': 'Re-entering text will clear current reading progress, including marked words and selected senses. Continue?',
  '当前阅读进度只有关闭窗口时才会保存到历史记录。现在切换会丢失这次未关闭的进度，确认继续？': 'Current reading progress is saved to history only when the window closes. Switching now will lose this unclosed progress. Continue?',
  '确认删除这条阅读历史记录？删除后无法恢复。': 'Delete this reading history record? This cannot be undone.',
  '当前文本已锁定，只读展示，避免改动后破坏后续标记与选义进度。': 'The current text is locked as read-only to avoid breaking later marking and sense-selection progress.',
  '输入或粘贴英文原文后开始阅读。': 'Enter or paste English text to start reading.',
  '先通读全文，把握大意，只标记生词，不边读边查词。': 'Read through the full text first, grasp the gist, and only mark new words instead of looking them up while reading.',
  '把握文章大意，这一点和休闲阅读没有区别。': 'Focus on the general meaning, just like casual reading.',
  '第一遍阅读过程中不要查词典': 'Do not use the dictionary during the first pass.',
  '一次性查出所有不认识单词的意思，不要在阅读过程中分散查词。': 'Look up all unknown words at once instead of interrupting reading with scattered lookups.',
  '如果一个单词有多个释义，只选择当前语境下最顺的那个意思。': 'If a word has multiple senses, choose the one that fits the current context best.',
  '继续重复第二遍的做法，让单词和释义的联结变得更稳。': 'Repeat the second-pass method to strengthen the link between words and meanings.',
  '第三遍要做的事情和第二遍一致。': 'The third pass follows the same approach as the second.',
  '第四遍开始，重点从生词转向句法问题。': 'From the fourth pass onward, shift focus from vocabulary to syntax.',
  '如果这时还有读不懂的句子，说明主要问题已经不是单词，而是句法。': 'If sentences are still unclear now, the main problem is syntax rather than vocabulary.',
  '针对读不懂的句子做句法分析，通常就能把句意理顺。': 'Analyze the syntax of unclear sentences to clarify their meaning.',
  '如果暂时不会做句法分析，可以先通过语法书解决。': 'If syntax analysis is still difficult, use a grammar book first.',
  '如果句子还是读不懂，就系统查语法书，把语法现象记录下来。': 'If sentences are still unclear, study the grammar systematically and record the grammar patterns.',
  '查阅语法书，彻底弄清楚当前句子的语法现象。': 'Use a grammar book to fully understand the grammar in the current sentence.',
  '把这种语法现象和对应句子一起记录下来。': 'Record the grammar pattern together with the sentence.',
  '如果查完语法书仍然看不懂，再去请教英语更熟练的人帮你彻底讲清楚。': 'If it is still unclear after checking grammar references, ask someone stronger in English to explain it thoroughly.',
  '第六遍请从头到尾把文章再顺一遍。': 'For the sixth pass, read the article smoothly from beginning to end again.',
  '即使还有些磕绊，也说明你已经把这篇文章从头到尾读懂了。': 'Even with a few bumps, this means you have understood the article end to end.',
  '继续整篇顺读，让理解越来越接近"直接读懂"的状态。': 'Keep reading the whole article smoothly until understanding feels closer to direct comprehension.',
  '最后再读一遍，这一遍通常会比上一遍更加顺利。': 'Read it one final time; this pass is usually smoother than the previous one.',
  '不断重复之后，大脑把英文转成可理解信息的过程会越来越短。': 'With repetition, the brain gets faster at turning English into understandable information.',
  '练习量足够以后，这种"像是直接读懂"的感觉会逐渐变成真实能力。': 'With enough practice, the feeling of "almost directly understanding" gradually becomes real ability.',
  '将生单词的具体释义全部收藏为生词，纳入后续背词任务。': 'Favorite the specific senses of new words and add them to later vocabulary review.',
  '将第五遍阅读时记录下来的语法现象也记到记忆软件中，后续和单词一起复习。': 'Add grammar patterns recorded during the fifth pass to your memory system and review them with vocabulary later.',
  '应用正在启动': 'App is starting',
  '正在启动 FenyiDic...': 'Starting FenyiDic...',
  '读取中': 'Loading',
  '开发模式：预览应用启动 Loading': 'Development: preview app startup loading',
  '预览 Loading': 'Preview Loading',
  '预览更新': 'Preview Update',
  '开发模式：预览软件更新内容弹窗': 'Development: preview the software update dialog',
  '不写入': 'No Writes',
  '正常': 'Normal',
  '本次已跳过全部阅读卡片': 'All Reading Cards Were Skipped',
  '当前这次没有剩余复习内容，后续再次进入复习时这些卡片仍会出现。': 'No review items remain this time. These cards will appear again in future review sessions.',
  '当前没有到期复习内容': 'No Reviews Due',
  '稍后再来，或给更多词条/义项打上复习标签': 'Come back later, or assign review tags to more entries and senses.',
  '调试模式：本次复习不计入 FSRS': 'Debug mode: this review will not update FSRS',
  '已完成本次复习': 'Review Complete',
  '本次队列中的所有卡片都已处理完成。': 'All cards in this review queue have been completed.',
  '关闭复习窗口': 'Close Review Window',
  '搜索中...': 'Searching...',
  '未找到结果': 'No Results Found',
  '搜索历史': 'Search History',
  '清空': 'Clear',
  '适合词典里没有的短语、句子或自定义释义': 'For phrases, sentences, or custom definitions not found in the dictionary',
  '未找到词条': 'Entry Not Found',
  '你是不是要找:': 'Did you mean:',
  '你是不是要找：': 'Did you mean:',
  '该分类下没有义项': 'No senses in this category',
  '选择标签': 'Select Tags',
  '新建标签': 'New Tag',
  '暂无可选标签': 'No tags available',
  '暂无可用标签': 'No tags available',
  '创建并选中': 'Create and Select',
  '标签管理': 'Tag Management',
  '重命名': 'Rename',
  '添加': 'Add',
  '支持单词、短语和句子；保存后会更新当前自定义卡片。编辑英文原文时，会同步更新当前自定义词条下的其他释义卡片。': 'Supports words, phrases, and sentences. Saving updates this custom card. Editing the English text also updates the other sense cards under this custom entry.',
  '支持单词、短语和句子；保存后会生成新的自定义卡片。相同英文内容重复录入时，会追加到同一条自定义词条下，作为新的释义卡片保存。': 'Supports words, phrases, and sentences. Saving creates a custom card. Reusing the same English text adds a new sense card to the existing custom entry.',
  '英文原文（必填）': 'English Text (Required)',
  '中文翻译（必填）': 'Chinese Translation (Required)',
  '英文翻译（选填）': 'English Translation (Optional)',
  '笔记（选填）': 'Note (Optional)',
  '例句（选填）': 'Examples (Optional)',
  '英文句子': 'English Sentence',
  '中文翻译': 'Chinese Translation',
  '导入词典': 'Import Dictionary',
  '请选择你的 MDX 词典文件开始使用': 'Select your MDX dictionary file to get started',
  '为规避版权问题，请自行下载下面的牛津双解词典文件后导入，且目前应用只支持此 MDX 词典文件，暂不支持别的 MDX 词典文件：': 'For copyright reasons, download and import the Oxford bilingual dictionary file below. Other MDX dictionary files are not supported yet:',
  '为规避版权问题，请自行下载下面的牛津双解词典文件后导入，且目前应用只支持此 MDX': 'For copyright reasons, download and import the Oxford bilingual dictionary file below. The app currently supports only this MDX',
  '词典文件，暂不支持别的 MDX 词典文件：': ' dictionary file; other MDX files are not supported yet:',
  '下载牛津双解词典文件': 'Download Oxford Bilingual Dictionary',
  '百度网盘': 'Baidu Netdisk',
  'MDX 词典文件': 'MDX Dictionary File',
  '选择 MDX 文件': 'Select MDX File',
  'MDD 音频文件': 'MDD Audio Files',
  '(可选)': '(Optional)',
  '选择 MDD 文件（多选，共 4 个）': 'Select MDD Files (multiple, 4 total)',
  '开始导入': 'Start Import',
  '提示：MDX 文件是必需的词典数据，MDD 文件包含发音音频。': 'Tip: The MDX file contains required dictionary data; MDD files contain pronunciation audio.',
  '导入过程可能需要几分钟，请耐心等待。': 'Import may take a few minutes.',
  '拼写正确！': 'Correct!',
  '你的答案：': 'Your answer:',
  '点击下方按钮提交': 'Click the button below to submit',
  '按 Enter 或点击下方按钮提交': 'Press Enter or click the button below to submit',
  '听写内容': 'Submit Dictation',
  '拼写原文': 'Submit Spelling',
  '播放原文': 'Play Original',
  '(点击重播)': '(click to replay)',
  '思考释义': 'Recall the Meaning',
  '朗读原文': 'Read Aloud',
  '重播原文': 'Replay Original',
  '重播对比 (您 vs 标准)': 'Replay Comparison (You vs. Reference)',
  '（暂无例句）': '(No examples)',
  '复习前列表模式': 'Pre-review List',
  '先筛掉本次不用复习的卡片': 'Skip Cards You Do Not Need This Time',
  '勾选后仅跳过当前这次复习，后续复习时这些卡片仍会再次出现。目前仅支持先筛掉进行阅读理解复习的卡片。': 'Selected cards are skipped only for this session and will appear again later. Currently, only reading-comprehension cards can be filtered here.',
  '全部跳过': 'Skip All',
  '清空勾选': 'Clear Selection',
  '点击翻转查看释义': 'Click to reveal the definition',
  '点击翻转查看原文': 'Click to reveal the original text',
  '上一页': 'Previous',
  '下一页': 'Next',
  '精读说明': 'Reading Guide',
  '辅助精读法说明': 'Guided Intensive Reading Guide',
  '历史记录': 'History',
  '阅读历史': 'Reading History',
  '关闭阅读窗口后，会保存到这里，可继续阅读或回顾已完成内容。': 'Progress is saved here after the reading window closes, so you can continue or revisit completed texts.',
  '暂无阅读历史。关闭阅读窗口后，阅读进度会保存到这里。': 'No reading history yet. Progress will be saved here after the reading window closes.',
  '继续阅读': 'Continue Reading',
  '本次已标记': 'Marked This Session',
  '点击正文中不认识的单词进行标记。': 'Click unknown words in the text to mark them.',
  '阅读原文': 'Source Text',
  '上一步': 'Previous Step',
  '下一步': 'Next Step',
  '第二步标记或第三步选义的单词会出现在这里。': 'Words marked in step two or assigned a sense in step three appear here.',
  '尚未选择语境义项': 'No contextual sense selected',
  '释义选择': 'Sense Selection',
  '当前词：': 'Current word:',
  '未找到可替换的词条。': 'No replacement entry found.',
  '点击已标记的单词后，将在这里显示可选释义。': 'Click a marked word to see available senses here.',
  '正在加载释义...': 'Loading definitions...',
  '当前词': 'current word',
  '第三步标记的中文释义会在这里乱序显示。': 'Chinese definitions selected in step three appear here in shuffled order.',
  '标记过的单词': 'Marked Words',
  '第三步标记过的单词会在这里集中显示。': 'Words marked in step three appear together here.',
  '本次标记释义': 'Senses Marked This Session',
  '批量加标签': 'Add Tags in Batch',
  '第三步标记过的释义会在这里集中显示。': 'Senses marked in step three appear together here.',
  '已收藏': 'Favorited',
  '完成': 'Finish',
  'noun 名词': 'noun',
  'verb 动词': 'verb',
  'adjective 形容词': 'adjective',
  'adverb 副词': 'adverb',
  'preposition 介词': 'preposition',
  'abbreviation 缩写': 'abbreviation',
  'definitions 释义': 'definitions',
  'idiom 习语': 'idiom',
  'pronoun 代词': 'pronoun',
  'conjunction 连词': 'conjunction',
  'exclamation 感叹词': 'exclamation',
  'determiner 限定词': 'determiner',
  'number 数词': 'number',
  'modal 情态动词': 'modal'
}

const exactMessageTranslations = {
  'zh-CN': {} as Record<string, string>,
  'en-US': exactEnglishTextTranslations
} as const satisfies Record<AppLocale, Record<string, string>>

const semanticMessages = {
  'zh-CN': {
    settingsLanguageTitle: '界面语言',
    settingsLanguageSubtitle: '切换应用界面文案语言',
    settingsFeedbackTitle: '问题反馈',
    settingsFeedbackSubtitle: '点击邮箱，通过系统默认邮件客户端反馈问题或建议',
    settingsFeedbackEmailAction: '发送反馈邮件',
    settingsFeedbackEmailError: '无法打开邮件客户端，请手动复制邮箱地址',
    languageChinese: '简体中文',
    languageEnglish: 'English',
    languageRestartTitle: '重启应用以切换语言',
    languageRestartMessage: '切换界面语言需要重启应用。确认后会保存当前选择并重新启动。',
    languageRestartConfirm: '重启应用',
    languageRestartCancel: '取消',
    updateCurrentVersion: '当前版本：{version}',
    updateLatestVersion: '最新版本：{version}',
    updateReleaseNotesTitle: '本次更新内容：\n{notes}',
    updateOpenReleasePageQuestion: '是否前往 GitHub Releases 下载新版安装包？',
    updateMacPrivacyHint: 'macOS 每次安装完后都需要去系统设置中的隐私与安全性中点击“仍要打开”',
    updateAlreadyLatest: '当前版本 {version} 已是最新版本。'
  },
  'en-US': {
    settingsLanguageTitle: 'Interface Language',
    settingsLanguageSubtitle: 'Switch the app UI language',
    settingsFeedbackTitle: 'Feedback',
    settingsFeedbackSubtitle: 'Email bug reports or suggestions using your default mail app',
    settingsFeedbackEmailAction: 'Send feedback email',
    settingsFeedbackEmailError: 'Unable to open the mail app. Please copy the email address manually.',
    languageChinese: 'Simplified Chinese',
    languageEnglish: 'English',
    languageRestartTitle: 'Relaunch to Change Language',
    languageRestartMessage: 'Changing the interface language requires relaunching the app. Confirm to save this choice and relaunch.',
    languageRestartConfirm: 'Relaunch',
    languageRestartCancel: 'Cancel',
    updateCurrentVersion: 'Current version: {version}',
    updateLatestVersion: 'Latest version: {version}',
    updateReleaseNotesTitle: 'What changed:\n{notes}',
    updateOpenReleasePageQuestion: 'Open GitHub Releases to download the new installer?',
    updateMacPrivacyHint: 'After installing, macOS may require allowing the app again in System Settings > Privacy & Security.',
    updateAlreadyLatest: 'Version {version} is already the latest version.'
  }
} as const

export type MessageKey = keyof typeof semanticMessages[typeof DEFAULT_APP_LOCALE]

const parameterPattern = /\{([A-Za-z0-9_]+)\}/g
const translatableAttributeNames = [
  'aria-label',
  'data-action-tooltip',
  'placeholder',
  'title',
  'value'
] as const

const textNodeOriginalValues = new WeakMap<Text, string>()
const textNodeLocalizedValues = new WeakMap<Text, string>()
const elementOriginalAttributeValues = new WeakMap<Element, Map<string, string>>()

interface LocalizationContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => Promise<void>
  t: (key: MessageKey, params?: MessageParams) => string
  translate: (text: string) => string
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null)

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_APP_LOCALES as readonly string[]).includes(value)
  )
}

function interpolate(message: string, params: MessageParams = {}): string {
  return message.replace(parameterPattern, (_match, key: string) => {
    const value = params[key]
    return value === null || value === undefined ? '' : String(value)
  })
}

function translateExact(locale: AppLocale, text: string): string {
  return exactMessageTranslations[locale][text] || text
}

function translateTextCore(locale: AppLocale, value: string): string {
  const translatedExactText = translateExact(locale, value)
  if (translatedExactText !== value) {
    return translatedExactText
  }

  return value
    .replace(/^当前版本：(.+)$/, (_match, version) => `Current version: ${version}`)
    .replace(/^最新版本：(.+)$/, (_match, version) => `Latest version: ${version}`)
    .replace(/^未找到 “(.+)” 的可用词条。$/, (_match, query) => `No available entries found for "${query}".`)
    .replace(/^成功还原了 (\d+) 个项目$/, (_match, count) => `Restored ${count} item(s)`)
    .replace(/^成功添加了 (\d+) 个单词级卡片$/, (_match, count) => `Added ${count} word-level card(s)`)
    .replace(/^已选择 (\d+) 项$/, (_match, count) => `${count} selected`)
    .replace(/^会读取 (.+) 作为单词列，并把匹配到的词导入为单词级收藏卡片。$/, (_match, columns) => `Reads ${columns} as the word column and imports matched entries as word-level favorite cards.`)
    .replace(/^如果包含 (.+)，会同时导入为单词笔记。$/, (_match, columns) => `If ${columns} is present, it will also be imported as a word note.`)
    .replace(/^确定要删除选中的 (\d+) 项的笔记吗？$/, (_match, count) => `Delete notes from the selected ${count} item(s)?`)
    .replace(/^当前版本 (.+)。点击后会检查发布源，有新版本时可前往 GitHub Releases 下载新版安装包。$/, (_match, version) => `Current version ${version}. Click to check the release source; if a new version is available, you can download it from GitHub Releases.`)
    .replace(/^确定要收藏选中的 (\d+) 项吗？$/, (_match, count) => `Favorite the selected ${count} item(s)?`)
    .replace(/^确定要取消收藏选中的 (\d+) 项吗？$/, (_match, count) => `Unfavorite the selected ${count} item(s)?`)
    .replace(/^确定要归档选中的 (\d+) 项吗？$/, (_match, count) => `Archive the selected ${count} item(s)?`)
    .replace(/^确定要取消归档选中的 (\d+) 项吗？$/, (_match, count) => `Unarchive the selected ${count} item(s)?`)
    .replace(/^没有想要的？手动录入「(.+)」$/, (_match, query) => `Not what you need? Add "${query}" manually`)
    .replace(/^词典里没有？手动录入「(.+)」$/, (_match, query) => `Not in the dictionary? Add "${query}" manually`)
    .replace(/^未找到目标词条: "(.+)"$/, (_match, query) => `Target entry not found: "${query}"`)
    .replace(/^确定要删除标签 "(.+)" 吗？\n这将从所有关联的词条中移除此标签。$/, (_match, tagName) => `Delete the tag "${tagName}"?\nThis tag will be removed from all associated entries.`)
    .replace(/^第 (\d+) 句$/, (_match, index) => `Example ${index}`)
    .replace(/^第 (\d+) 条例句英文不能超过 (\d+) 个字符$/, (_match, index, limit) => `English text in example ${index} cannot exceed ${limit} characters`)
    .replace(/^第 (\d+) 条例句中文不能超过 (\d+) 个字符$/, (_match, index, limit) => `Chinese text in example ${index} cannot exceed ${limit} characters`)
    .replace(/^英文内容不能超过 (\d+) 个字符$/, (_match, limit) => `English content cannot exceed ${limit} characters`)
    .replace(/^笔记不能超过 (\d+) 个字符$/, (_match, limit) => `The note cannot exceed ${limit} characters`)
    .replace(/^中文内容不能超过 (\d+) 个字符$/, (_match, limit) => `Chinese content cannot exceed ${limit} characters`)
    .replace(/^(\d+) 个文件已选择$/, (_match, count) => `${count} files selected`)
    .replace(/^正在复制词典文件\.\.\.$/, () => 'Copying dictionary file...')
    .replace(/^正在复制音频文件 (\d+)\/(\d+)\.\.\.$/, (_match, current, total) => `Copying audio file ${current}/${total}...`)
    .replace(/^正在加载词典\.\.\.$/, () => 'Loading dictionary...')
    .replace(/^正在解析词条 (\d+)\/(\d+)\.\.\.$/, (_match, current, total) => `Parsing entries ${current}/${total}...`)
    .replace(/^正在保存配置\.\.\.$/, () => 'Saving configuration...')
    .replace(/^导入完成！共 (\d+) 个词条$/, (_match, count) => `Import complete: ${count} entries`)
    .replace(/^展示答案 (.+)$/, (_match, keyLabel) => `Show Answer ${keyLabel}`)
    .replace(/^开始复习（剩余 (\d+) 张）$/, (_match, count) => `Start Review (${count} remaining)`)
    .replace(/^给选中的 (\d+) 项添加以下标签$/, (_match, count) => `Add the following tags to ${count} selected item(s)`)
    .replace(/^从选中的 (\d+) 项移除以下标签$/, (_match, count) => `Remove the following tags from ${count} selected item(s)`)
    .replace(/^跳转到(.+)$/, (_match, label) => `Go to ${translateTextCore(locale, label)}`)
    .replace(/^标记 (\d+)$/, (_match, count) => `Marked ${count}`)
    .replace(/^选义 (\d+)$/, (_match, count) => `Senses ${count}`)
    .replace(/^最近阅读 (.+)$/, (_match, time) => `Last read ${time}`)
    .replace(/^共 (\d+) 项$/, (_match, count) => `${count} item(s)`)
    .replace(/^单词 (\d+)$/, (_match, index) => `Word ${index}`)
    .replace(/^释义 (\d+)$/, (_match, index) => `Sense ${index}`)
    .replace(/^全文 (\d+) 处$/, (_match, count) => `${count} occurrence(s) in the text`)
    .replace(/^第 (\d+) 处$/, (_match, index) => `Occurrence ${index}`)
    .replace(/^已选 (\d+) \/ 共 (\d+) 项$/, (_match, selected, total) => `${selected} of ${total} selected`)
    .replace(/^展开更多例句 \((\d+)\)$/, (_match, count) => `Show ${count} more example(s)`)
    .replace(/^笔记: (.+)$/, (_match, note) => `Note: ${note}`)
    .replace(/^未自动找到"单词"列 \(支持: (.+)\)\.\n\n检测到的表头: (.+)\n\n是否使用第一列作为单词列\?$/, (_match, supportedColumns, detectedHeaders) => `Could not automatically find a "word" column (supported: ${supportedColumns}).\n\nDetected headers: ${detectedHeaders}\n\nUse the first column as the word column?`)
}

export function translateUiText(locale: AppLocale, value: string): string {
  if (locale !== 'en-US' || value.length === 0) {
    return value
  }

  const firstContentIndex = value.search(/\S/)
  if (firstContentIndex < 0) {
    return value
  }

  const lastContentIndex = value.search(/\s*$/)
  const content = value.slice(firstContentIndex, lastContentIndex)
  let translatedContent = translateTextCore(locale, content)
  if (translatedContent === content && content.includes('\n')) {
    translatedContent = content
      .split('\n')
      .map((line) => translateUiText(locale, line))
      .join('\n')
  }

  if (translatedContent === content) {
    return value
  }

  return `${value.slice(0, firstContentIndex)}${translatedContent}${value.slice(lastContentIndex)}`
}

function shouldSkipNode(node: Node): boolean {
  const parentElement = node.parentElement
  if (!parentElement) {
    return true
  }

  return Boolean(parentElement.closest('[data-localization-skip="true"]'))
}

function translateTextNode(locale: AppLocale, node: Text): void {
  if (shouldSkipNode(node)) {
    return
  }

  const currentValue = node.nodeValue || ''
  const previousOriginalValue = textNodeOriginalValues.get(node)
  const previousLocalizedValue = textNodeLocalizedValues.get(node)
  const originalValue =
    previousOriginalValue === undefined ||
    previousLocalizedValue === undefined ||
    currentValue !== previousLocalizedValue
      ? currentValue
      : previousOriginalValue
  textNodeOriginalValues.set(node, originalValue)

  const translatedValue = translateUiText(locale, originalValue)
  textNodeLocalizedValues.set(node, translatedValue)
  if (node.nodeValue !== translatedValue) {
    node.nodeValue = translatedValue
  }
}

function translateElementAttributes(locale: AppLocale, element: Element): void {
  if (element.closest('[data-localization-skip="true"]')) {
    return
  }

  let originalAttributeValues = elementOriginalAttributeValues.get(element)
  if (!originalAttributeValues) {
    originalAttributeValues = new Map<string, string>()
    elementOriginalAttributeValues.set(element, originalAttributeValues)
  }

  for (const attributeName of translatableAttributeNames) {
    if (!element.hasAttribute(attributeName)) {
      continue
    }

    const currentValue = element.getAttribute(attributeName) || ''
    const originalValue = originalAttributeValues.get(attributeName) || currentValue
    originalAttributeValues.set(attributeName, originalValue)

    const translatedValue = translateUiText(locale, originalValue)
    if (currentValue !== translatedValue) {
      element.setAttribute(attributeName, translatedValue)
    }
  }
}

function translateNodeTree(locale: AppLocale, rootNode: Node): void {
  if (rootNode.nodeType === Node.TEXT_NODE) {
    translateTextNode(locale, rootNode as Text)
    return
  }

  if (rootNode.nodeType !== Node.ELEMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return
  }

  if (rootNode.nodeType === Node.ELEMENT_NODE) {
    translateElementAttributes(locale, rootNode as Element)
  }

  const treeWalker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
  )
  let currentNode = treeWalker.nextNode()
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      translateTextNode(locale, currentNode as Text)
    } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(locale, currentNode as Element)
    }
    currentNode = treeWalker.nextNode()
  }
}

function useDomLocalization(locale: AppLocale): void {
  useEffect(() => {
    const translateDocument = () => translateNodeTree(locale, document.body)
    translateDocument()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          translateNodeTree(locale, mutation.target)
          continue
        }

        if (mutation.type === 'attributes') {
          translateNodeTree(locale, mutation.target)
          continue
        }

        for (const addedNode of Array.from(mutation.addedNodes)) {
          translateNodeTree(locale, addedNode)
        }
      }
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...translatableAttributeNames],
      characterData: true,
      childList: true,
      subtree: true
    })

    return () => observer.disconnect()
  }, [locale])
}

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_APP_LOCALE)

  useEffect(() => {
    let isEffectActive = true

    window.api.getSetting<AppLocale>('appLanguage').then((storedLocale) => {
      if (isEffectActive && isAppLocale(storedLocale)) {
        setLocaleState(storedLocale)
      }
    })

    return () => {
      isEffectActive = false
    }
  }, [])

  const setLocale = useCallback(async (nextLocale: AppLocale) => {
    if (!isAppLocale(nextLocale)) {
      return
    }

    if (nextLocale === locale) {
      return
    }

    const saveResult = await window.api.setSetting('appLanguage', nextLocale)
    if (!saveResult.success) {
      console.error('Failed to save app language before restart')
      return
    }
  }, [locale])

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => {
      const localeMessages = semanticMessages[locale]
      const defaultMessages = semanticMessages[DEFAULT_APP_LOCALE]
      const message = localeMessages[key] || defaultMessages[key]

      if (import.meta.env.DEV) {
        console.assert(Boolean(message), `Missing localization message: ${key}`)
      }

      return interpolate(message, params)
    },
    [locale]
  )

  const translate = useCallback((text: string) => translateUiText(locale, text), [locale])

  useDomLocalization(locale)

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      translate
    }),
    [locale, setLocale, t, translate]
  )

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}

export function useLocalization(): LocalizationContextValue {
  const value = useContext(LocalizationContext)
  if (!value) {
    throw new Error('useLocalization must be used inside LocalizationProvider')
  }

  return value
}
