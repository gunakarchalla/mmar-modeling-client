import { valueConverter } from 'aurelia';

@valueConverter('numerise')
export class NumeriseConverter {
    toView(value: string, default_value: number, fallback_value: number): number {
        if (value == 'not defined' || value == 'undefined' || value == '') return default_value ? default_value : fallback_value;
        if (!value) return default_value ? default_value : fallback_value;
        return parseFloat(value);
    }
    fromView(value: number): string {
        return value.toString();
    }
}