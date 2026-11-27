window.__ModuleLoader__.load({
  id: 'dsh-global-instructions',
  factory(require) {
    const React = require('react');
    const { createElement: h, useEffect, useSyncExternalStore } = React;
    const dictionaries = {
      zh: {
        title: '全局指令', scope: '为不同项目的新会话设置默认指令，不修改项目自己的规则。', newSession: '修改后请新建会话。',
        loading: '正在读取…', working: '正在提交…', toggle: '启用方案', on: '已启用', off: '已暂停，不应用任何方案',
        applied: '当前应用', next: '下次启用时应用', lastSelected: '上次选用', externalStatus: '文件有外部变动',
        preview: '查看和编辑', create: '新建方案', rename: '重命名', delete: '删除方案', name: '方案名称', cancel: '取消', submitCreate: '创建', submitRename: '保存名称',
        createConfirm: '新建后将切换到空白方案，当前未保存的修改会丢失。继续吗？',
        previewConfirm: '切换查看会丢失当前未保存的修改。继续吗？',
        deleteConfirm: '确定删除这个方案吗？此操作无法撤销。', deleteDirtyConfirm: '确定删除这个方案及当前草稿吗？此操作无法撤销。',
        cannotDeleteSelected: '选用中的方案不能删除。请先选用另一个方案。', cannotDeleteLast: '至少保留一个方案。',
        apply: '应用此方案', choose: '设为下次启用的方案', applyingSaved: '启用或应用时只使用已保存的内容。',
        saveActive: '保存后，新会话会使用更新后的指令。', saveInactive: '保存内容不会切换或启用方案。',
        placeholder: '例如：默认使用中文回答；修改代码前先说明方案。', editor: '方案指令内容', save: '保存内容',
        saved: '内容已保存。', created: '已新建空白方案，未应用。', changed: '设置已更新。', deleted: '方案已删除。',
        unchanged: '没有未保存的修改', dirty: '有未保存的修改', reload: '重新读取', retry: '重试', limit: 'UTF-8 字节',
        reloadConfirm: '重新读取成功后，当前未保存的修改会丢失。继续吗？',
        conflict: '文件或方案已在别处变动。若要保留草稿，请手动复制编辑框里的文字，再点击「重新读取」。',
        external: '全局指令文件已在别处修改。可将文件内容保存为新方案并选用，不会覆盖已有方案。',
        externalMissing: '全局指令文件已被移除。确认后将暂停使用方案，保留所有方案。',
        adopt: '导入为新方案', adoptMissing: '确认暂停', adopted: '已导入并选用新方案，已有方案已保留。', paused: '已暂停，所有方案已保留。',
        tooLarge: '内容超过 UTF-8 字节上限，无法保存。', unsafe: '路径不安全，无法读取或修改。',
        invalid: '文件不是有效的 UTF-8 文本，未修改原文件。', failed: '操作失败，未保存的草稿仍在编辑框中。',
        badName: '请输入 1 到 60 个字符，名称不能和已有方案重复。', schemeLimit: '方案数量已达上限。请在「查看和编辑」中选一个未应用的方案，再删除。',
        invalidState: '无法安全读取已保存的方案。请先检查全局指令文件和方案数据。',
        auth: '没有访问权限或登录已失效，请重新打开已登录的 DSH 页面。', originRequired: '写入请求未通过来源检查。请刷新 DSH 页面后重试。', timeout: '请求超时，请重试。',
        unconfirmed: '操作结果未确认。若要保留草稿，请手动复制编辑框里的文字，再点击「重新读取」核实。'
      },
      en: {
        title: 'Global instructions', scope: 'Set default instructions for new sessions across projects without changing project rules.', newSession: 'Start a new session after making changes.',
        loading: 'Reading…', working: 'Submitting…', toggle: 'Enable scheme', on: 'Enabled', off: 'Paused. No scheme is applied.',
        applied: 'Applied scheme', next: 'Scheme for next enable', lastSelected: 'Last selected', externalStatus: 'File changed elsewhere',
        preview: 'View and edit', create: 'New scheme', rename: 'Rename', delete: 'Delete scheme', name: 'Scheme name', cancel: 'Cancel', submitCreate: 'Create', submitRename: 'Save name',
        createConfirm: 'Creating a scheme opens it for editing and discards your unsaved changes. Continue?',
        previewConfirm: 'Switching the editor discards your unsaved changes. Continue?',
        deleteConfirm: 'Delete this scheme? This cannot be undone.', deleteDirtyConfirm: 'Delete this scheme and its unsaved draft? This cannot be undone.',
        cannotDeleteSelected: 'Choose a different scheme before deleting this one.', cannotDeleteLast: 'Keep at least one scheme.',
        apply: 'Apply this scheme', choose: 'Use when enabled', applyingSaved: 'Enabling or applying uses only saved content.',
        saveActive: 'After saving, new sessions use the updated instructions.', saveInactive: 'Saving does not switch or enable schemes.',
        placeholder: 'For example: Explain the plan before changing code.', editor: 'Scheme instructions', save: 'Save content',
        saved: 'Content saved.', created: 'Empty scheme created. It is not applied.', changed: 'Settings updated.', deleted: 'Scheme deleted.',
        unchanged: 'No unsaved changes', dirty: 'Unsaved changes', reload: 'Reload', retry: 'Retry', limit: 'UTF-8 bytes',
        reloadConfirm: 'A successful reload discards your unsaved changes. Continue?',
        conflict: 'The file or schemes changed elsewhere. To keep your draft, manually copy the editor text before clicking Reload.',
        external: 'The global instructions file changed elsewhere. Import its content as the active scheme without overwriting any saved schemes.',
        externalMissing: 'The global instructions file was removed. Confirm to pause scheme use and keep all schemes.',
        adopt: 'Import as new scheme', adoptMissing: 'Confirm pause', adopted: 'New scheme imported and selected. Existing schemes were kept.', paused: 'Paused. All schemes were kept.',
        tooLarge: 'Content exceeds the UTF-8 byte limit and cannot be saved.', unsafe: 'The path is unsafe and cannot be read or modified.',
        invalid: 'The file is not valid UTF-8. The original was not changed.', failed: 'The operation failed. Any unsaved draft remains in the editor.',
        badName: 'Use a unique name of 1 to 60 characters.', schemeLimit: 'Scheme limit reached. Pick an unused scheme in View and edit, then delete it.',
        invalidState: 'Saved schemes could not be read safely. Check the global instructions file and scheme data before retrying.',
        auth: 'Access was denied or authentication expired. Reopen your authenticated DSH page.', originRequired: 'The write request failed the origin check. Refresh DSH and try again.', timeout: 'The request timed out. Please retry.',
        unconfirmed: 'The outcome is unconfirmed. To keep your draft, manually copy the editor text before clicking Reload to verify.'
      }
    };
    const css = `
.gie-body{min-width:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}
.gie-title{font-size:22px;font-weight:650;line-height:1.4;margin:0}.gie-hint{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6;margin:0}.gie-title+.gie-hint{margin-top:4px}
.gie-path{display:block;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary)}
.gie-meta,.gie-note{padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);font-size:13px;line-height:1.6}.gie-status{min-width:0;overflow-wrap:anywhere}.gie-note>button{margin-top:8px}
.gie-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.gie-between{justify-content:space-between}.gie-picker{display:flex;flex-direction:column;gap:4px}.gie-picker-row{align-items:stretch}.gie-picker-row>select{flex:1 1 160px}.gie-picker-row>button{margin-inline-start:auto;max-width:100%}.gie-picker-row>:is(select,button){box-sizing:border-box;min-height:36px;line-height:20px}.gie-field{min-width:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px}.gie-name{flex:1 1 140px}
.gie-editor{box-sizing:border-box;width:100%;min-height:180px;height:30dvh;max-height:440px;resize:vertical;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:14px/1.65 ui-monospace,Consolas,monospace;tab-size:2}
.gie-count{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
.gie-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 12px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}.gie-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-secondary)}.gie-btn:disabled,.gie-field:disabled{opacity:.55;cursor:not-allowed}.gie-primary{border-color:var(--dsw-alias-brand-primary);font-weight:600}
.gie-switch{display:inline-flex;position:relative;align-items:center;width:34px;height:20px;padding:2px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2);cursor:pointer}.gie-switch::before{content:'';width:14px;height:14px;background:var(--dsw-alias-label-secondary);border-radius:50%;transform:translateX(0)}.gie-switch[aria-checked=true]{border-color:var(--dsw-alias-brand-primary)}.gie-switch[aria-checked=true]::before{background:var(--dsw-alias-brand-primary);transform:translateX(14px)}.gie-switch:disabled{opacity:.55;cursor:not-allowed}
.gie-note.gie-error{border-inline-start:3px solid var(--dsw-alias-state-error-primary)}.gie-note.gie-success{border-inline-start:3px solid var(--dsw-alias-state-success-primary)}.gie-count .gie-error{color:var(--dsw-alias-label-primary);font-weight:600}.gie-body :is(button,select,input,textarea):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
`;
    const route = '/api/plugins/global-instructions/schemes';
    const schemeLimit = 16; // Matches the store's capacity; allow freeing space for an external import.
    const errorKeys = { ORIGIN_REQUIRED: 'originRequired', TOO_LARGE: 'tooLarge', UNSAFE_PATH: 'unsafe', INVALID_UTF8: 'invalid', AUTH: 'auth', TIMEOUT: 'timeout', INVALID_STATE: 'invalidState', SCHEME_LIMIT: 'schemeLimit' };
    const validName = (name) => !!name && [...name].length <= 60 && !/[\uD800-\uDFFF]/u.test(name);
    const find = (snapshot, id) => snapshot?.schemes.find((scheme) => scheme.id === id);
    const isDirty = ({ snapshot, editingId, draft }) => !!snapshot && draft !== find(snapshot, editingId)?.content;
    const byteLength = (value) => new TextEncoder().encode(value).length;
    function isSnapshot(value) {
      return value && typeof value.revision === 'string' &&
        typeof value.fileVersion === 'string' && typeof value.path === 'string' && typeof value.exists === 'boolean' &&
        typeof value.enabled === 'boolean' && typeof value.externalChanged === 'boolean' &&
        Number.isSafeInteger(value.maxBytes) && value.maxBytes >= 0 && Array.isArray(value.schemes) &&
        value.schemes.every((scheme) => scheme && typeof scheme.id === 'string' && typeof scheme.name === 'string' && typeof scheme.content === 'string') &&
        new Set(value.schemes.map((scheme) => scheme.id)).size === value.schemes.length && !!find(value, value.selectedId);
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale;
        ctx.effect(() => locale.register('global-instructions', dictionaries));
        const t = locale.bind('global-instructions');
        const subscribeLocale = (fn) => locale.subscribe(fn);
        const localeRevision = () => locale.getSnapshot().revision;
        // The settings section may unmount during requests or while editing.
        let state = { snapshot: null, editingId: null, draft: '', nameForm: null, busy: null, notice: null, reloadRequired: null };
        let disposed = false;
        let activeRequest = null;
        const listeners = new Set();
        const getState = () => state;
        const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
        function update(patch) {
          if (disposed) return;
          state = { ...state, ...patch };
          for (const listener of listeners) listener();
        }
        ctx.effect(() => {
          const warn = (event) => {
            if (isDirty(state) || state.busy === 'POST') {
              event.preventDefault();
              event.returnValue = '';
            }
          };
          window.addEventListener('beforeunload', warn);
          return () => {
            disposed = true;
            activeRequest?.cancel();
            listeners.clear();
            window.removeEventListener('beforeunload', warn);
          };
        });
        async function request(method, body) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          activeRequest = { cancel() { clearTimeout(timer); controller.abort(); } };
          const transportCode = () => method === 'POST' ? 'SAVE_UNCONFIRMED' : controller.signal.aborted ? 'TIMEOUT' : 'IO_ERROR';
          try {
            const response = await fetch(route, { method, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal,
              headers: body ? { 'Content-Type': 'application/json', 'X-DSH-Instructions-Write': '1' } : {}, body: body ? JSON.stringify(body) : undefined });
            if (response.status === 401 || response.status === 403) {
              const denial = await response.json().catch(() => null);
              throw { code: response.status === 403 && denial?.error?.code === 'ORIGIN_REQUIRED' ? 'ORIGIN_REQUIRED' : 'AUTH' };
            }
            const data = await response.json();
            if (data?.ok === false && typeof data.error?.code === 'string') throw { code: data.error.code };
            if (!response.ok || data?.ok !== true || !isSnapshot(data.value)) throw { code: transportCode() };
            return data.value;
          } catch (error) {
            if (typeof error?.code === 'string') throw error;
            throw { code: transportCode() };
          } finally { clearTimeout(timer); activeRequest = null; }
        }
        const errorNotice = (error) => ({ error: true, key: Object.hasOwn(errorKeys, error?.code) ? errorKeys[error.code] : 'failed' });
        function editorFor(snapshot, id) {
          const scheme = find(snapshot, id) || find(snapshot, snapshot.selectedId);
          return { editingId: scheme.id, draft: scheme.content };
        }
        async function load() {
          if (disposed || state.busy) return;
          update({ busy: 'GET', notice: null });
          try {
            const value = await request('GET');
            update({ snapshot: value, ...editorFor(value, state.editingId), reloadRequired: null, nameForm: null });
          } catch (error) { update({ notice: errorNotice(error) }); }
          finally { update({ busy: null }); }
        }
        function reload() {
          if (disposed || state.busy || (isDirty(state) && !window.confirm(t('reloadConfirm')))) return;
          void load();
        }
        function preview(id) {
          if (disposed || state.busy || id === state.editingId || !find(state.snapshot, id) ||
              (isDirty(state) && !window.confirm(t('previewConfirm')))) return;
          update({ ...editorFor(state.snapshot, id), nameForm: null, notice: null });
        }
        function canChange(type) {
          const { snapshot, busy, reloadRequired } = state;
          if (disposed || !snapshot || busy || reloadRequired) return false;
          if (!snapshot.externalChanged) return type !== 'adoptExternal';
          return type === 'adoptExternal' || (type === 'delete' && snapshot.exists && snapshot.schemes.length === schemeLimit);
        }
        async function mutate(action) {
          if (!canChange(action.type)) return;
          const { snapshot, editingId, draft } = state;
          update({ busy: 'POST', notice: null });
          try {
            const value = await request('POST', { revision: snapshot.revision, fileVersion: snapshot.fileVersion, action });
            let edit;
            let key = 'changed';
            if (action.type === 'create') {
              const created = value.schemes.find(({ id }) => !find(snapshot, id));
              edit = editorFor(value, created?.id || editingId);
              key = 'created';
            } else if (action.type === 'delete' || action.type === 'save') {
              edit = editorFor(value, editingId);
              key = action.type === 'delete' ? 'deleted' : 'saved';
            } else if (action.type === 'adoptExternal') {
              // Importing is explicit, but must not discard edits to any existing scheme.
              if (!isDirty(state)) edit = editorFor(value, value.selectedId);
              key = snapshot.exists ? 'adopted' : 'paused';
            }
            update({ snapshot: value, ...(edit || { editingId, draft }), nameForm: null, notice: { key } });
          } catch (error) {
            if (error?.code === 'CONFLICT') update({ reloadRequired: 'conflict' });
            // The projection may have committed before an IO error finalizing the journal.
            else if (error?.code === 'SAVE_UNCONFIRMED' || error?.code === 'IO_ERROR') update({ reloadRequired: 'unconfirmed' });
            else if (error?.code === 'INVALID_ARGUMENT' && (action.type === 'create' || action.type === 'rename')) {
              update({ notice: { error: true, key: 'badName' } });
            } else update({ notice: errorNotice(error) });
          } finally { update({ busy: null }); }
        }
        function startName(type) {
          if (!canChange(type)) return;
          update({ nameForm: { type, name: type === 'rename' ? find(state.snapshot, state.editingId).name : '' }, notice: null });
        }
        function submitName(event) {
          event.preventDefault();
          const form = state.nameForm;
          const name = form?.name.trim();
          if (!form || !canChange(form.type)) return;
          if (!validName(name)) { update({ notice: { error: true, key: 'badName' } }); return; }
          if (form.type === 'rename' && name === find(state.snapshot, state.editingId).name) return;
          if (form.type === 'create' && isDirty(state) && !window.confirm(t('createConfirm'))) return;
          void mutate(form.type === 'create' ? { type: 'create', name } : { type: 'rename', id: state.editingId, name });
        }
        function save() {
          if (!canChange('save') || !isDirty(state) || byteLength(state.draft) > state.snapshot.maxBytes) return;
          void mutate({ type: 'save', id: state.editingId, content: state.draft });
        }
        function select() {
          if (!canChange('select') || state.editingId === state.snapshot.selectedId) return;
          void mutate({ type: 'select', id: state.editingId });
        }
        function toggle() {
          if (!canChange('setEnabled')) return;
          void mutate({ type: 'setEnabled', enabled: !state.snapshot.enabled });
        }
        function remove() {
          if (!canChange('delete') || state.snapshot.schemes.length <= 1 || state.editingId === state.snapshot.selectedId) return;
          if (window.confirm(t(isDirty(state) ? 'deleteDirtyConfirm' : 'deleteConfirm'))) void mutate({ type: 'delete', id: state.editingId });
        }
        const button = (key, onClick, disabled, className = '', props = {}) => h('button', {
          type: 'button', className: `gie-btn ${className}`, disabled, onClick, ...props
        }, t(key));
        const note = (key, tone, children) => h('div', { role: tone === 'error' ? 'alert' : 'status', className: `gie-note gie-${tone}` }, t(key), children);
        function Editor() {
          useSyncExternalStore(subscribeLocale, localeRevision);
          const current = useSyncExternalStore(subscribe, getState);
          const { snapshot, editingId, draft, nameForm, busy, notice, reloadRequired } = current;
          const dirty = isDirty(current);
          const bytes = byteLength(draft);
          const over = !!snapshot && bytes > snapshot.maxBytes;
          const blocked = !!busy || !!reloadRequired || !!snapshot?.externalChanged;
          const needsSpace = !!snapshot?.externalChanged && snapshot.exists && snapshot.schemes.length === schemeLimit;
          const deleteReason = snapshot?.schemes.length === 1 ? 'cannotDeleteLast' : snapshot?.selectedId === editingId ? 'cannotDeleteSelected' : null;
          useEffect(() => {
            if (!isDirty(state) && !state.reloadRequired && !state.snapshot?.externalChanged && !state.nameForm) void load();
          }, []);
          return h('section', { className: 'gie-body', 'aria-labelledby': 'gie-title' },
            h('style', null, css),
            h('header', null, h('h2', { id: 'gie-title', className: 'gie-title' }, t('title')), h('p', { className: 'gie-hint' }, t('scope'))),
            snapshot && h('div', { className: 'gie-meta gie-row gie-between' },
              h('div', { className: 'gie-status' },
                h('strong', null, t(snapshot.externalChanged ? 'externalStatus' : snapshot.enabled ? 'on' : 'off')),
                h('div', null, t(snapshot.externalChanged ? 'lastSelected' : snapshot.enabled ? 'applied' : 'next'), ': ', find(snapshot, snapshot.selectedId).name)),
              h('div', { className: 'gie-row' },
                h('span', { id: 'gie-toggle-label' }, t('toggle')),
                h('button', { type: 'button', role: 'switch', className: 'gie-switch', 'aria-labelledby': 'gie-toggle-label', 'aria-checked': snapshot.enabled, disabled: blocked, onClick: toggle }))),
            reloadRequired && note(reloadRequired, 'error'),
            snapshot?.externalChanged && note(snapshot.exists ? 'external' : 'externalMissing', 'error',
              needsSpace ? h('div', null, t('schemeLimit')) :
                button(snapshot.exists ? 'adopt' : 'adoptMissing', () => void mutate({ type: 'adoptExternal' }), !!busy || !!reloadRequired)),
            busy && h('p', { role: 'status', className: 'gie-hint' }, t(busy === 'GET' ? 'loading' : 'working')),
            snapshot && h('div', { className: 'gie-picker' },
              h('label', { className: 'gie-hint', htmlFor: 'gie-scheme-picker' }, t('preview')),
              h('div', { className: 'gie-row gie-picker-row' },
                h('select', { id: 'gie-scheme-picker', className: 'gie-field', value: editingId, disabled: !!busy, onChange: (event) => preview(event.target.value) },
                  ...snapshot.schemes.map(({ id, name }) => h('option', { key: id, value: id }, name))),
                editingId !== snapshot.selectedId && button(snapshot.enabled ? 'apply' : 'choose', select, blocked))),
            snapshot && dirty && h('p', { className: 'gie-hint' }, t('applyingSaved')),
            snapshot && h('div', { className: 'gie-row' },
              button('create', () => startName('create'), blocked),
              button('rename', () => startName('rename'), blocked),
              button('delete', remove, !!busy || !!reloadRequired || (!!snapshot.externalChanged && !needsSpace) || !!deleteReason,
                '', deleteReason ? { 'aria-describedby': 'gie-delete-reason', title: t(deleteReason) } : {})),
            snapshot && deleteReason && h('p', { id: 'gie-delete-reason', className: 'gie-hint' }, t(deleteReason)),
            nameForm && h('form', { className: 'gie-row', onSubmit: submitName },
              h('input', { type: 'text', className: 'gie-field gie-name', value: nameForm.name, disabled: blocked, required: true,
                placeholder: t('name'), 'aria-label': t('name'), autoFocus: true,
                onChange: (event) => { if (!state.busy && state.nameForm) update({ nameForm: { ...state.nameForm, name: event.target.value } }); } }),
              button(nameForm.type === 'create' ? 'submitCreate' : 'submitRename', undefined, blocked || !nameForm.name.trim(), '', { type: 'submit' }),
              button('cancel', () => { if (!state.busy) update({ nameForm: null }); }, !!busy)),
            snapshot && h('div', null,
              h('textarea', { className: 'gie-editor', 'aria-label': t('editor'), spellCheck: false, value: draft, disabled: !!busy,
                placeholder: t('placeholder'), onChange: (event) => { if (!state.busy) update({ draft: event.target.value, notice: null }); } }),
              h('div', { className: 'gie-count' }, h('span', null, t(dirty ? 'dirty' : 'unchanged')),
                h('span', { className: over ? 'gie-error' : '' }, `${bytes.toLocaleString()} / ${snapshot.maxBytes.toLocaleString()} ${t('limit')}`))),
            over && note('tooLarge', 'error'),
            notice && note(notice.key, notice.error ? 'error' : 'success'),
            h('div', { className: 'gie-row gie-between' }, button(snapshot ? 'reload' : 'retry', reload, !!busy),
              snapshot && button('save', save, blocked || !dirty || over, 'gie-primary')),
            snapshot && !snapshot.externalChanged && !reloadRequired && h('p', { className: 'gie-hint' },
              t(snapshot.enabled && editingId === snapshot.selectedId ? 'saveActive' : 'saveInactive'), ' ', t('newSession')),
            snapshot && h('code', { className: 'gie-path' }, snapshot.path));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'global-instructions-editor', order: 510, label: () => t('title') }, Editor));
      }
    };
  }
});
