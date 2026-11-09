/** Couriers tab on Tax & shipping: the list and its edit modal. Tokens only. */
export const couriersCss = `
.scr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem}
.scr-head h3{margin:0;font-size:1rem;display:flex;align-items:center}
.scr-head p{margin:0.25rem 0 0;font-size:0.8125rem;color:var(--color-text-secondary)}
.scr-list{list-style:none;margin:0;padding:0;border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;background:var(--color-surface)}
.scr-row{display:flex;align-items:center;gap:0.875rem;padding:0.875rem 1rem;border-top:1px solid var(--color-border)}
.scr-row:first-child{border-top:0}
.scr-row:hover{background:var(--color-bg-subtle)}
.scr-avatar{flex-shrink:0;width:2.25rem;height:2.25rem;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;background:var(--color-primary-subtle);color:var(--color-primary-dark);border:1px solid var(--color-primary-border);font-weight:600;font-size:0.875rem}
.scr-main{flex:1;min-width:0}
.scr-name{font-weight:600;font-size:0.9375rem;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-meta{display:flex;flex-wrap:wrap;gap:0.375rem;margin-top:0.375rem}
.scr-meta .badge{font-size:11px;padding:2px 8px}
.scr-empty{border:1px dashed var(--color-border-strong);border-radius:var(--radius-lg);padding:2rem 1rem;text-align:center;color:var(--color-text-secondary);font-size:0.875rem}
.scr-empty strong{display:block;color:var(--color-text);font-size:0.9375rem;margin-bottom:0.25rem}
.scr-empty .btn{margin-top:0.875rem}
.scr-status{margin:0.75rem 0 0;font-size:0.8125rem}
.scr-status--ok{color:var(--color-success)}
.scr-status--err{color:var(--color-error)}

.scr-overlay{position:fixed;inset:0;z-index:10000;background:var(--color-overlay);display:flex;align-items:center;justify-content:center;padding:1rem}
.scr-modal{background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:var(--radius-xl);width:100%;max-width:720px;max-height:min(90vh,920px);display:flex;flex-direction:column;box-shadow:var(--shadow-xl);overflow:hidden}
.scr-modal-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;border-bottom:1px solid var(--color-border)}
.scr-modal-head h2{margin:0;font-size:1.0625rem;font-weight:600}
.scr-close{background:none;border:0;color:var(--color-text-muted);font-size:1.375rem;line-height:1;cursor:pointer;padding:0.25rem 0.5rem;border-radius:var(--radius-sm)}
.scr-close:hover,.scr-close:focus-visible{color:var(--color-text);background:var(--color-bg-subtle)}
.scr-modal-body{flex:1;overflow-y:auto;padding:0.25rem 1.25rem 1.25rem}
.scr-modal-foot{display:flex;align-items:center;gap:0.5rem;padding:0.875rem 1.25rem;border-top:1px solid var(--color-border);background:var(--color-bg-subtle)}
.scr-modal-foot .scr-spacer{flex:1}
.scr-modal-foot .scr-status{margin:0}

.scr-section{padding:1.125rem 0;border-top:1px solid var(--color-border)}
.scr-section:first-child{border-top:0}
.scr-section-title{display:flex;align-items:center;margin:0 0 0.75rem;font-size:0.75rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--color-text-muted)}
.scr-grid{display:grid;gap:0.875rem}
.scr-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}
.scr-modal .field{margin:0}
.scr-modal .field>label{display:flex;align-items:center}
.scr-modal .settings-check{font-size:0.875rem}
.scr-note{margin:0;padding:0.625rem 0.75rem;border-radius:var(--radius-md);background:var(--color-bg-subtle);border:1px solid var(--color-border);font-size:0.8125rem;color:var(--color-text-secondary)}
.scr-sub{margin-left:1.5rem;padding-left:0.875rem;border-left:2px solid var(--color-border)}

.scr-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:1.875rem;height:1.875rem;padding:0;border:1px solid transparent;border-radius:var(--radius-sm);background:none;color:var(--color-text-muted);cursor:pointer}
.scr-icon-btn:hover:not(:disabled),.scr-icon-btn:focus-visible{color:var(--color-text);background:var(--color-bg-subtle);border-color:var(--color-border)}
.scr-icon-btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.scr-icon-btn:disabled{opacity:0.35;cursor:default}
.scr-icon-btn--primary{color:var(--color-primary);border-color:var(--color-primary-border);background:var(--color-primary-subtle)}
.scr-icon-btn--primary:hover:not(:disabled){color:var(--color-primary-dark);background:var(--color-primary-subtle);border-color:var(--color-primary)}
.scr-icon-btn--danger:hover:not(:disabled),.scr-icon-btn--danger:focus-visible{color:var(--color-error);background:var(--color-error-bg);border-color:transparent}

.scr-order{display:flex;flex-direction:column;gap:2px;flex-shrink:0}
.scr-order .scr-icon-btn{width:1.5rem;height:1.25rem}
.scr-order svg{width:13px;height:13px}
.scr-badge-warn svg{width:12px;height:12px}

.scr-suggest{display:flex;flex-wrap:wrap;align-items:center;gap:0.375rem;margin-top:0.5rem;font-size:0.75rem;color:var(--color-text-muted)}
.scr-chip{border:1px dashed var(--color-primary-border);background:var(--color-primary-subtle);color:var(--color-primary-dark);border-radius:var(--radius-full);padding:2px 10px;font-size:0.75rem;cursor:pointer;line-height:1.6}
.scr-chip:hover,.scr-chip:focus-visible{border-style:solid;border-color:var(--color-primary)}
.scr-chip:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.scr-warn{display:flex;align-items:center;gap:0.375rem;margin-top:0.375rem;font-size:0.75rem;color:var(--color-warning)}
.scr-warn svg{width:13px;height:13px;flex-shrink:0}

.scr-preview{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.75rem;padding:0.75rem;border:1px dashed var(--color-border-strong);border-radius:var(--radius-md);background:var(--color-bg-subtle)}
.scr-preview-label{flex-basis:100%;font-size:0.6875rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--color-text-muted)}
.scr-preview-btn{display:inline-flex;align-items:center;gap:0.375rem;padding:0.4rem 0.875rem;border:1px solid var(--color-border-strong);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text);font-size:0.875rem;font-weight:500}
.scr-preview-hint{font-size:0.8125rem;color:var(--color-text-secondary)}

.scr-faqs{list-style:none;margin:0;padding:0;display:grid;gap:0.5rem}
.scr-faq{border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface)}
.scr-faq--editing{display:grid;gap:0.625rem;padding:0.75rem;background:var(--color-bg-subtle)}
.scr-faq-line{display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0.375rem 0.25rem 0.25rem}
.scr-faq-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:0.375rem;padding:0.375rem;border:0;background:none;color:var(--color-text);text-align:left;cursor:pointer;border-radius:var(--radius-sm);font-size:0.875rem}
.scr-faq-toggle:hover{background:var(--color-bg-subtle)}
.scr-faq-toggle:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
.scr-faq-question{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.scr-chevron{display:inline-flex;flex-shrink:0;color:var(--color-text-muted);transition:transform var(--dur-base)}
.scr-chevron--open{transform:rotate(180deg)}
.scr-faq-actions{display:flex;gap:2px;flex-shrink:0}
.scr-faq-answer{margin:0;padding:0 0.875rem 0.75rem 2.125rem;font-size:0.8125rem;color:var(--color-text-secondary);white-space:pre-wrap}
.scr-faq-edit-actions{display:flex;align-items:center;justify-content:flex-end;gap:0.375rem}
.scr-faq-edit-actions .scr-status{margin:0 auto 0 0}

@media (max-width:640px){
  .scr-grid--2{grid-template-columns:minmax(0,1fr)}
  .scr-head{flex-direction:column}
  .scr-row{flex-wrap:wrap}
  .scr-sub{margin-left:0}
  .scr-faq-question{white-space:normal}
}
`
