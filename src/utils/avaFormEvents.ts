// Custom event system for AVA form commands
export const AVA_FORM_EVENT = 'ava-form-command';

export interface AvaFormCommand {
  action: 'fill_field' | 'navigate_step' | 'submit' | 'trigger_generate';
  field?: string;
  value?: any;
  step?: number;
  target?: 'workflow' | 'full_job' | 'description';
}

export function dispatchAvaFormCommand(command: AvaFormCommand) {
  console.log('Dispatching AVA form command:', command);
  window.dispatchEvent(new CustomEvent(AVA_FORM_EVENT, { detail: command }));
}

export function subscribeToAvaFormCommands(callback: (command: AvaFormCommand) => void) {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<AvaFormCommand>;
    callback(customEvent.detail);
  };
  window.addEventListener(AVA_FORM_EVENT, handler);
  return () => window.removeEventListener(AVA_FORM_EVENT, handler);
}
