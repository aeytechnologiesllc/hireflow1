import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { countryCodes, type CountryCode } from "@/lib/countryCodes";
import { PRIMARY_COUNTRY_FOR_CODE } from "@/lib/phoneNumber";

interface CountryCodeSelectProps {
  /** The dial code ("+63"), or "" when none is picked yet. */
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/**
 * The country a code is shown as. Several countries share some codes (+44 is
 * Guernsey, the Isle of Man, Jersey and the UK; +7 Kazakhstan and Russia):
 * the one the applicant picked from the list when they did, else the main
 * one (PRIMARY_COUNTRY_FOR_CODE), never simply the first in the list. A
 * pasted UK number used to switch the selector to Guernsey's flag.
 */
function countryForCode(code: string, pickedIso?: string | null): CountryCode | null {
  if (!code) return null;
  const sharing = countryCodes.filter((c) => c.code === code);
  if (sharing.length === 0) return null;
  return (
    (pickedIso ? sharing.find((c) => c.country === pickedIso) : undefined) ??
    sharing.find((c) => c.country === PRIMARY_COUNTRY_FOR_CODE[code]) ??
    sharing[0]
  );
}

export default function CountryCodeSelect({
  value,
  onValueChange,
  className,
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  // The exact country picked from the list, so picking Jersey shows Jersey;
  // a code that arrives some other way (a paste) shows its main country.
  const [pickedIso, setPickedIso] = useState<string | null>(null);

  const selectedCountry = countryForCode(value, pickedIso);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={selectedCountry ? `Country code ${selectedCountry.code}, ${selectedCountry.name}` : "Pick your country code"}
          className={cn("w-[120px] justify-between px-3", className)}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-1.5 truncate">
              <span>{selectedCountry.flag}</span>
              <span className="text-sm">{selectedCountry.code}</span>
            </span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">Country</span>
          )}
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." className="h-9" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countryCodes.map((country) => (
                <CommandItem
                  key={`${country.code}-${country.country}`}
                  value={`${country.name} ${country.country} ${country.code}`}
                  onSelect={() => {
                    setPickedIso(country.country);
                    onValueChange(country.code);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="text-base">{country.flag}</span>
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {country.code}
                  </span>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      selectedCountry?.country === country.country ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
