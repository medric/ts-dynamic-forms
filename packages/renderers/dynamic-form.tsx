import React from 'react';
import {
  useForm,
  SubmitHandler,
  FieldValues,
  Path,
  UseFormRegister,
  FormState,
} from 'react-hook-form';
import { nanoid } from 'nanoid';
import classNames from 'classnames';
import { FormDefinition, FormField, FormSchema } from '~core/types';

interface SchemaRendererProps {
  model: string;
  formSchema: FormSchema;
  level: number;
  parentField: string;
  renderLabel?: (key: string) => React.ReactNode;
  renderInput?: (
    key: string,
    type: FormField['type'],
    register: UseFormRegister<FieldValues>,
    formState: FormState<FieldValues>
  ) => React.ReactNode;
}

const SchemaRenderer = React.memo(function SchemaRenderer({
  model,
  formSchema,
  level,
  parentField,
  renderLabel,
  renderInput,
}: SchemaRendererProps) {
  return (
    <div>
      <h3>{parentField}</h3>
      <DynamicForm
        model={model}
        formSchema={formSchema}
        level={level + 1}
        parentKey={parentField}
        renderLabel={renderLabel}
        renderInput={renderInput}
      />
    </div>
  );
});

interface EnumRendererProps<IFormInput extends FieldValues> {
  enumValues: string[];
  field: Path<IFormInput>;
  register: UseFormRegister<FieldValues>;
  renderLabel?: (key: string) => React.ReactNode;
}

const EnumRenderer = React.memo(function EnumRenderer<
  IFormInput extends FieldValues,
>({ enumValues, field, register, renderLabel }: EnumRendererProps<IFormInput>) {
  return (
    <div>
      {renderLabel ? (
        renderLabel(field)
      ) : (
        <label htmlFor={field}>{field}</label>
      )}
      <select {...register(field)}>
        {enumValues.map((enumKey: string) => (
          <option key={enumKey} value={enumKey}>
            {enumKey}
          </option>
        ))}
      </select>
    </div>
  );
});

interface DynamicFormProps<IFormInput extends FieldValues> {
  model: keyof FormSchema['models'];
  formSchema: FormSchema;
  level?: number;
  parentKey?: string;
  title?: string;
  className?: string;
  onSubmit?: SubmitHandler<IFormInput>;
  renderLabel?: (key: string) => React.ReactNode;
  renderInput?: (
    key: string,
    type: FormField['type'],
    register: UseFormRegister<FieldValues>,
    formState: FormState<FieldValues>
  ) => React.ReactNode;
}

export function DynamicForm<IFormInput extends FieldValues>({
  model,
  formSchema,
  level = 0,
  parentKey = '',
  title,
  className,
  onSubmit,
  renderLabel,
  renderInput,
}: DynamicFormProps<IFormInput>) {
  const { register, handleSubmit, formState } = useForm<IFormInput>();

  const { errors } = formState;

  const formId = `dynamic-form-${nanoid()}`;

  const renderFormElement = (key: string, value: FormField) => {
    const field = key as Path<IFormInput>;

    if (value.type === 'object' && typeof value.ref === 'string') {
      return (
        <SchemaRenderer
          key={field}
          model={value.ref}
          formSchema={formSchema}
          level={level + 1}
          parentField={field}
          renderLabel={renderLabel}
          renderInput={renderInput}
        />
      );
    }

    if (value.type === 'array' && typeof value.ref === 'string') {
      return (
        <SchemaRenderer
          key={field}
          model={value.ref}
          formSchema={formSchema}
          level={level + 1}
          parentField={field}
          renderLabel={renderLabel}
          renderInput={renderInput}
        />
      );
    }

    if (value.type === 'enum' && typeof value.ref === 'string') {
      const enumValues = formSchema.enums[value.ref] as unknown as string[];
      return (
        <EnumRenderer
          key={field}
          field={field}
          enumValues={enumValues}
          register={register as UseFormRegister<FieldValues>}
          renderLabel={renderLabel}
        />
      );
    }

    const formField = formSchema.models[model][key];

    const { message, pattern, ...validators } = formField.validators ?? {};

    const filteredValidators = Object.entries(validators).reduce(
      (acc, [validator, value]) => {
        if (value !== undefined) {
          acc[validator] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

    // Render regular inputs
    const inputLabelText = formField.label ?? field;
    return (
      <div key={field}>
        {renderLabel ? (
          renderLabel(field)
        ) : (
          <label htmlFor={field}>{inputLabelText}</label>
        )}
        {renderInput ? (
          renderInput(
            key,
            value.type,
            register as UseFormRegister<FieldValues>,
            formState
          )
        ) : (
          <>
            <input
              {...register(field, {
                required: formField.required ? (message as string) : false,
                ...filteredValidators,
                validate: (value) => {
                  if (
                    typeof pattern === 'string' &&
                    !RegExp(pattern).test(value)
                  ) {
                    return (message as string) ?? 'This field is invalid';
                  }
                  return true;
                },
              })}
            />
            {errors?.[field]?.message && <p>{String(errors[field]?.message) ?? ''}</p>}
          </>
        )}
      </div>
    );
  };

  const form = formSchema.models[model];

  const renderForm = () => {
    return Object.entries(form).map(([key, value]) =>
      renderFormElement(key, value)
    );
  };

  if (parentKey) {
    return <div>{renderForm()}</div>;
  }

  return (
    <form
      id={formId}
      className={classNames('dynamic-form', className)}
      onSubmit={handleSubmit(onSubmit ?? (() => {}))}
    >
      {title && <h2>{title}</h2>}
      {renderForm()}
      <input type="submit" />
    </form>
  );
}
