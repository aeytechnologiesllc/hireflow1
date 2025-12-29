import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DropdownProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarDropdown({ value, onChange, children, name }: DropdownProps) {
  const handleValueChange = (newValue: string) => {
    if (onChange) {
      const syntheticEvent = {
        target: { value: newValue },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  // Extract options from children (which are <option> elements)
  const options = React.Children.toArray(children).map((child) => {
    if (React.isValidElement(child) && child.type === 'option') {
      return {
        value: child.props.value?.toString() || '',
        label: child.props.children,
        disabled: child.props.disabled,
      };
    }
    return null;
  }).filter(Boolean);

  return (
    <Select value={value?.toString()} onValueChange={handleValueChange}>
      <SelectTrigger 
        className={cn(
          "h-8 gap-1 border-none bg-transparent px-2 font-medium",
          "hover:bg-accent focus:ring-0 focus:ring-offset-0",
          "text-sm min-w-[4.5rem]",
          name === "years" && "min-w-[5rem]"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[280px] overflow-y-auto bg-popover">
        {options.map((option) => option && (
          <SelectItem 
            key={option.value} 
            value={option.value} 
            disabled={option.disabled}
            className="cursor-pointer"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 pointer-events-auto", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        caption_dropdowns: "flex items-center gap-1",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-transparent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white focus:bg-emerald-500 focus:text-white ring-0 outline-none",
        day_today: "bg-muted/50 text-foreground font-semibold ring-1 ring-emerald-500/50",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
