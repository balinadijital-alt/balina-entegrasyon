<?php

namespace App\Services\Accounting;

class TaxNumberValidator
{
    public function validate(?string $value): bool
    {
        $digits = preg_replace('/\D+/', '', (string) $value);

        if (strlen($digits) === 10) {
            return ! preg_match('/^(\d)\1{9}$/', $digits);
        }

        if (strlen($digits) === 11) {
            if ($digits[0] === '0' || preg_match('/^(\d)\1{10}$/', $digits)) return false;
            $odd = array_sum([$digits[0], $digits[2], $digits[4], $digits[6], $digits[8]]);
            $even = array_sum([$digits[1], $digits[3], $digits[5], $digits[7]]);
            $digit10 = (($odd * 7) - $even) % 10;
            $digit11 = array_sum(str_split(substr($digits, 0, 10))) % 10;
            return (int) $digits[9] === $digit10 && (int) $digits[10] === $digit11;
        }

        return false;
    }
}
