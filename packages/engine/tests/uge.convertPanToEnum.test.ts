import { convertPanToEnum } from '../src/export/ugeWriter';

describe('convertPanToEnum helper', () => {
    test('object with enum returns enum uppercase', () => {
        expect(convertPanToEnum({ enum: 'l' }, false)).toBe('L');
        expect(convertPanToEnum({ enum: 'R' }, false)).toBe('R');
    });

    test('object with numeric value snaps unless strictGb', () => {
        expect(convertPanToEnum({ value: -1 }, false)).toBe('L');
        expect(() => convertPanToEnum({ value: -1 }, true, 'instrument')).toThrow('Numeric instrument pan not allowed in strict GB export');
    });

    test('plain number snaps or throws when strict', () => {
        expect(convertPanToEnum(-0.5, false)).toBe('L');
        expect(() => convertPanToEnum(-0.5, true, 'inline')).toThrow('Numeric inline pan not allowed in strict GB export');
    });

    test('string L/R/C returned uppercase', () => {
        expect(convertPanToEnum('l', false)).toBe('L');
        expect(convertPanToEnum('C', false)).toBe('C');
    });

    test('numeric string snaps unless strict', () => {
        expect(convertPanToEnum('0.8', false)).toBe('R');
        expect(() => convertPanToEnum('0.8', true, 'instrument')).toThrow('Numeric instrument pan not allowed in strict GB export');
    });

    test('unknown inputs return undefined', () => {
        expect(convertPanToEnum(undefined, false)).toBeUndefined();
        expect(convertPanToEnum(null, false)).toBeUndefined();
        expect(convertPanToEnum({foo: 'bar'}, false)).toBeUndefined();
    });
});
