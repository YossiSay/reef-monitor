import React from "react";

interface InsetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
}

export const InsetInput = React.forwardRef<HTMLInputElement, InsetInputProps>(
    ({ label, id, type = "text", ...props }, ref) => {
        return (
            <div className="relative w-full">
                <input
                    id={id}
                    type={type}
                    ref={ref}
                    placeholder=" "
                    {...props}
                    className="peer h-12 w-full rounded-md border border-gray-300 bg-background px-3 pt-4 text-sm placeholder-transparent focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <label
                    htmlFor={id}
                    className="absolute left-3 top-2 text-xs text-muted-foreground transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-2 peer-focus:text-xs peer-focus:text-blue-500"
                >
                    {label}
                </label>
            </div>
        );
    }
);

InsetInput.displayName = "InsetInput";
