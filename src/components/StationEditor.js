import { reactive, watch, h, onBeforeUnmount } from 'vue';

export default {
  name: 'StationEditor',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    station: {
      type: Object,
      default: () => ({})
    },
    isNew: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'save'],
  setup(props, { emit }) {
    const form = reactive({
      name: '',
      en: '',
      skip: false,
      door: 'left',
      dock: 'both',
      // 折返标记: 'none' | 'pre' | 'post'
      turnback: 'none',
      xfer: [],
      expressStop: false
    });

    const applyDialogBlur = (state) => {
      if (typeof window === 'undefined') return;
      const blurApi = window.electronAPI && window.electronAPI.effects && window.electronAPI.effects.setDialogBlur;
      if (typeof blurApi === 'function') blurApi(state);
    };

    // 监听 station 变更以同步表单
    watch(() => props.station, (newVal) => {
      if (newVal) {
        form.name = newVal.name || '';
        form.en = newVal.en || '';
        form.skip = newVal.skip || false;
        form.door = newVal.door || 'left';
        form.dock = newVal.dock || 'both';
        form.turnback = newVal.turnback || 'none';
        form.expressStop = newVal.expressStop !== undefined ? !!newVal.expressStop : false;
        // 深拷贝换乘数组，避免直接改 props
        form.xfer = newVal.xfer ? JSON.parse(JSON.stringify(newVal.xfer)) : [];
      }
    }, { immediate: true, deep: true });

    const close = () => {
      applyDialogBlur(false);
      try { console.log('[StationEditor] close -> emit update:modelValue false'); } catch(e){}
      emit('update:modelValue', false);
    };

    const save = () => {
      if (!form.name) return; // 基础校验
      try { console.log('[StationEditor] save -> emitting save with', JSON.parse(JSON.stringify(form))); } catch(e){}
      emit('save', JSON.parse(JSON.stringify(form)));
      close();
    };

    const addXfer = () => {
      form.xfer.push({
        line: '',
        color: '#000000',
        suspended: false
      });
    };

    const removeXfer = (index) => {
      form.xfer.splice(index, 1);
    };

    const toggleXferSuspended = (index) => {
      form.xfer[index].suspended = !form.xfer[index].suspended;
    };

    watch(() => props.modelValue, (visible) => {
      applyDialogBlur(!!visible);
    }, { immediate: true });

    onBeforeUnmount(() => applyDialogBlur(false));

    return () => {
      if (!props.modelValue) return null;

      return h('div', {
        style: {
          position: 'fixed',
          inset: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: '10001'
        },
        onClick: (e) => {
          if (e.target === e.currentTarget) close();
        }
      }, [
        h('div', {
          style: {
            background: 'var(--card)',
            padding: '18px',
            borderRadius: '8px',
            width: '680px',
            maxWidth: '95%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
            color: 'var(--text)'
          }
        }, [
          // 顶部区域
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '1px solid var(--divider)',
              paddingBottom: '12px'
            }
          }, [
            h('div', { style: { fontWeight: '800', fontSize: '18px' } }, props.isNew ? '新建站点' : '站点编辑'),
            h('div', { style: { display: 'flex', gap: '8px' } }, [
              h('button', {
                class: 'btn',
                style: { background: 'var(--btn-gray-bg)', color: 'var(--btn-gray-text)' },
                onClick: close
              }, '取消'),
              h('button', {
                class: 'btn',
                style: { background: 'var(--accent)', color: 'white' },
                onClick: save
              }, '保存')
            ])
          ]),

          // 站名输入
          h('div', { style: { display: 'flex', gap: '12px', marginBottom: '16px' } }, [
            h('div', { style: { flex: '1' } }, [
                h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '中文站名'),
                h('input', {
                  value: form.name,
                  onInput: (e) => form.name = e.target.value,
                  placeholder: '例如: 人民广场',
                  style: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--divider)', background: 'var(--bg)', color: 'var(--text)' }
                })
            ]),
            h('div', { style: { flex: '1' } }, [
                h('label', { style: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '英文站名 (English)'),
                h('input', {
                  value: form.en,
                  onInput: (e) => form.en = e.target.value,
                  placeholder: 'e.g. People\'s Square',
                  style: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--divider)', background: 'var(--bg)', color: 'var(--text)' }
                })
            ])
          ]),

          // 运营状态与开门侧
          h('div', { style: { marginBottom: '20px', display: 'flex', gap: '12px' } }, [
            // 运营状态
            h('div', { style: { flex: '1' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '站点状态 (Status)'),
              h('div', { style: { display: 'flex', background: 'var(--bg)', padding: '4px', borderRadius: '6px' } }, [
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: !form.skip ? 'var(--card)' : 'transparent', color: !form.skip ? 'var(--accent)' : 'var(--muted)', fontWeight: 'bold', boxShadow: !form.skip ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.skip = false
                }, '正常运营'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.skip ? 'var(--card)' : 'transparent', color: form.skip ? 'var(--btn-org-bg)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.skip ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.skip = true
                }, '暂缓开通')
              ])
            ]),
            // 开门方向
            h('div', { style: { flex: '1' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '开门方向 (Door)'),
              h('div', { style: { display: 'flex', background: 'var(--bg)', padding: '4px', borderRadius: '6px' } }, [
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.door === 'left' ? 'var(--card)' : 'transparent', color: form.door === 'left' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.door === 'left' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.door = 'left'
                }, '左侧'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.door === 'right' ? 'var(--card)' : 'transparent', color: form.door === 'right' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.door === 'right' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.door = 'right'
                }, '右侧'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.door === 'both' ? 'var(--card)' : 'transparent', color: form.door === 'both' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.door === 'both' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.door = 'both'
                }, '双侧')
          ])
        ])
        ,
          // 停靠方向（仅允许上/下/双）
          h('div', { style: { flex: '1' } }, [
            h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '停靠方向 (Dock)'),
            h('div', { style: { display: 'flex', background: 'var(--bg)', padding: '4px', borderRadius: '6px' } }, [
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.dock === 'up' ? 'var(--card)' : 'transparent', color: form.dock === 'up' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.dock === 'up' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => form.dock = 'up'
              }, '仅上行'),
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.dock === 'down' ? 'var(--card)' : 'transparent', color: form.dock === 'down' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.dock === 'down' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => form.dock = 'down'
              }, '仅下行'),
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.dock === 'both' ? 'var(--card)' : 'transparent', color: form.dock === 'both' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.dock === 'both' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => form.dock = 'both'
              }, '双向')
            ])
          ])
          ]),

          // 折返设置 + 大站停靠同一行
          h('div', { style: { flex: '1', display:'flex', gap:'12px', alignItems:'stretch', marginTop:'12px' } }, [
            h('div', { style: { flex: '1' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '6px' } }, '折返位置 (Turnback)'),
              h('div', { style: { display: 'flex', background: 'var(--bg)', padding: '4px', borderRadius: '6px' } }, [
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.turnback === 'none' ? 'var(--card)' : 'transparent', color: form.turnback === 'none' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.turnback === 'none' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.turnback = 'none'
                }, '无'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.turnback === 'pre' ? 'var(--card)' : 'transparent', color: form.turnback === 'pre' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.turnback === 'pre' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.turnback = 'pre'
                }, '站前折返'),
                h('button', {
                  style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.turnback === 'post' ? 'var(--card)' : 'transparent', color: form.turnback === 'post' ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.turnback === 'post' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                  onClick: () => form.turnback = 'post'
                }, '站后折返')
              ])
            ]),
            h('div', { style: { width:'160px', display:'flex', flexDirection:'column', gap:'6px' } }, [
              h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)' } }, '大站停靠'),
            h('div', { style: { display:'flex', background: 'var(--bg)', padding: '4px', borderRadius: '6px' } }, [
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: form.expressStop ? 'var(--card)' : 'transparent', color: form.expressStop ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: form.expressStop ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => { form.expressStop = true; }
              }, '停靠'),
              h('button', {
                style: { flex: '1', border: 'none', padding: '8px', borderRadius: '4px', background: !form.expressStop ? 'var(--card)' : 'transparent', color: !form.expressStop ? 'var(--text)' : 'var(--muted)', fontWeight: 'bold', boxShadow: !form.expressStop ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: '0.2s' },
                onClick: () => { form.expressStop = false; }
              }, '跳过')
            ])
            ])
          ]),

          h('div', { style: { height:'12px' }}, []),

          // 换乘设置
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px dashed var(--divider)'
            }
          }, [
            h('span', { style: { fontWeight: 'bold', fontSize: '14px' } }, '换乘线路'),
            h('button', {
              class: 'btn',
              style: { background: 'var(--bg)', color: 'var(--accent)', fontSize: '12px', padding: '6px 12px', boxShadow:'0 4px 12px rgba(0,0,0,0.12)', borderRadius:'6px' },
              onClick: (e) => { e.preventDefault(); addXfer(); }
            }, '+ 添加换乘')
          ]),

          h('div', { style: { height:'4px' }}, []),

          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, form.xfer.map((xf, idx) => {
            return h('div', { key: idx, style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
              h('input', {
                value: xf.line,
                onInput: (e) => xf.line = e.target.value,
                placeholder: '线路名称/编号',
                style: { flex: '1', padding: '8px', borderRadius: '6px', border: '1px solid var(--divider)', background: 'var(--bg)', color: 'var(--text)' }
              }),
              h('div', { style: { position: 'relative', width: '40px', height: '34px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--divider)' } }, [
                  h('input', {
                    type: 'color',
                    value: xf.color,
                    onInput: (e) => xf.color = e.target.value,
                    style: { position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', padding: '0', border: 'none', cursor: 'pointer' }
                  })
              ]),
              h('button', {
                class: 'btn',
                style: { padding: '0 10px', height: '34px', fontSize: '12px', background: xf.suspended ? 'var(--btn-org-bg)' : 'var(--bg)', color: xf.suspended ? 'white' : 'var(--text)' },
                onClick: () => toggleXferSuspended(idx)
              }, xf.suspended ? '暂缓' : '正常'),
              h('button', {
                class: 'btn',
                style: { padding: '0 10px', height: '34px', background: 'var(--btn-red-bg)', color: 'white' },
                onClick: () => removeXfer(idx)
              }, h('i', { class: 'fas fa-times' }))
            ]);
          }))
        ])
      ]);
    };
  }
};
