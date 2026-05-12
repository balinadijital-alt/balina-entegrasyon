import { CheckCircle2 } from 'lucide-react';

export function WizardStepper({ steps, currentStep, onStepChange }) {
  return (
    <div className="onboarding-stepper">
      {steps.map((step, index) => {
        const completed = index < currentStep;
        const active = index === currentStep;
        return (
          <button type="button" className={active ? 'active' : completed ? 'completed' : ''} onClick={() => onStepChange(index)} key={step}>
            <span>{completed ? <CheckCircle2 size={16} /> : index + 1}</span>
            {step}
          </button>
        );
      })}
    </div>
  );
}
