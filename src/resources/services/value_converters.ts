import { valueConverter } from 'aurelia';

@valueConverter('numerise')
export class NumeriseConverter {
    toView(value: string): number {
        if (value == 'not defined' || value == 'undefined' || value == '') return 0;
        if (!value) return 0;
        return parseFloat(value) || 0;
    }
    fromView(value: number): string {
        return value.toString();
    }
}