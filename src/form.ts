import {Lens} from 'monocle-ts'
import {createAction, ActionFunction1, Action, ActionFunction0} from './create-action'
import {Dispatch, bindActionCreators, ActionCreatorsMapObject} from 'redux'
import {takeLatest, ForkEffect, put, select} from 'redux-saga/effects'
import {updateState} from '@optiqs/optiqs'

const toSnakeUpperCase = (inputString: string) =>
  inputString
    .split('')
    .map(character => {
      if (character === character.toUpperCase()) {
        return '_' + character.toLowerCase()
      } else {
        return character
      }
    })
    .join('')
    .toUpperCase()

const clearValue = <T>(value: T) => {
  return Array.isArray(value)
    ? []
    : typeof value === 'boolean'
    ? false
    : typeof value === 'number'
    ? 0
    : typeof value === 'object'
    ? {}
    : ''
}

type FormFieldsAccessors<FormDefinition> = {
  readonly [FormFieldName in keyof FormDefinition]: {
    valueAccessor: Lens<
      State<FormDefinition>,
      FormFieldsState<FormDefinition>[FormFieldName]['value']
    >
    validityStateAccessor: Lens<
      State<FormDefinition>,
      FormFieldsState<FormDefinition>[FormFieldName]['validityState']
    >
    touchStateAccessor: Lens<
      State<FormDefinition>,
      FormFieldsState<FormDefinition>[FormFieldName]['touchState']
    >
    valueStateAccessor: Lens<
      State<FormDefinition>,
      FormFieldsState<FormDefinition>[FormFieldName]['valueState']
    >
    errorAccessor: Lens<
      State<FormDefinition>,
      FormFieldsState<FormDefinition>[FormFieldName]['error']
    >
  }
}

export type FormFieldsState<FormDefinition> = {
  readonly [FormFieldName in keyof FormDefinition]: {
    readonly validityState: 'valid' | 'invalid'
    readonly touchState: 'touched' | 'untouched'
    readonly valueState: 'pristine' | 'dirty'
    readonly value: FormDefinition[FormFieldName]
    readonly error?: string
  }
}

type FormFieldsActions<FormDefinition> = {
  readonly [FormFieldName in keyof FormDefinition]: {
    readonly set: ActionFunction1<
      FormDefinition[FormFieldName],
      Action<FormDefinition[FormFieldName]>
    >
    readonly clear: ActionFunction0<void>
    readonly touch: ActionFunction0<void>
    readonly untouch: ActionFunction0<void>
  }
}

interface FormMasterState {
  isValid: boolean
  isPristine: boolean
  isTouched: boolean
}

export interface FormState<FormDefinition> {
  readonly state: FormFieldsState<FormDefinition> & FormMasterState
}

export interface FormActions<FormDefinition> {
  readonly actions: FormFieldsActions<FormDefinition>
}

type DispatchFormActions<FormDefinition> = (
  dispatch: Dispatch
) => {
  readonly actions: FormFieldsActions<FormDefinition>
}

interface StateForms<FormDefinition> {
  readonly [formName: string]: FormFieldsState<FormDefinition>
}

interface State<FormDefinition> {
  forms: StateForms<FormDefinition>
}

interface FormInstance<FormDefinition> {
  readonly initialState: FormFieldsState<FormDefinition>
  readonly accessors: FormFieldsAccessors<FormDefinition>
  readonly actions: FormFieldsActions<FormDefinition>
  readonly sagas: ForkEffect<never>[]
}

interface Form<FormDefinition> extends Omit<FormInstance<FormDefinition>, 'actions'> {
  readonly accessor: (
    s: State<FormDefinition>
  ) => {state: FormFieldsState<FormDefinition> & FormMasterState}
  readonly actions: DispatchFormActions<FormDefinition>
}

type FormRules<FormDefinition> = {
  readonly [FormFieldName in keyof FormDefinition]: {
    validate: (value: FormDefinition[FormFieldName]) => boolean
    error: (value: FormDefinition[FormFieldName]) => string
  }
}

const createInitialState = <
  FormDefinition,
  FormFieldName extends keyof FormDefinition = keyof FormDefinition
>(
  formData: FormDefinition,
  fieldName: FormFieldName,
  rules: FormRules<FormDefinition>
) => {
  const isValid = rules[fieldName].validate(formData[fieldName])
  return {
    validityState: isValid ? 'valid' : 'invalid',
    touchState: 'untouched',
    valueState: formData[fieldName] ? 'dirty' : 'pristine',
    value: formData[fieldName],
    error: !isValid ? rules[fieldName].error(formData[fieldName]) : undefined
  }
}

const createActions = <
  FormDefinition,
  FormFieldName extends keyof FormDefinition = keyof FormDefinition
>(
  formName: string,
  fieldName: FormFieldName
) => {
  const formNameUpper = toSnakeUpperCase(formName.toString())
  const fieldNameUpper = toSnakeUpperCase(fieldName.toString())
  return {
    set: createAction<FormDefinition[FormFieldName]>(`FORM/${formNameUpper}/SET_${fieldNameUpper}`),
    clear: createAction(`FORM/${formNameUpper}/CLEAR_${fieldNameUpper}`),
    touch: createAction(`FORM/${formNameUpper}/TOUCH_${fieldNameUpper}`),
    untouch: createAction(`FORM/${formNameUpper}/UNTOUCH_${fieldNameUpper}`)
  }
}

const createAccessors = <
  FormDefinition,
  FormFieldName extends keyof FormDefinition = keyof FormDefinition
>(
  formAccessor: Lens<State<FormDefinition>, FormFieldsState<FormDefinition>>,
  fieldName: FormFieldName
) => {
  const field = Lens.fromProp<FormFieldsState<FormDefinition>>()(fieldName)
  const fieldAccessor = formAccessor.compose(field)
  const getField = Lens.fromProp<FormFieldsState<FormDefinition>[FormFieldName]>()
  const valueAccessor = fieldAccessor.compose(getField('value'))
  const errorAccessor = fieldAccessor.compose(getField('error'))
  const touchStateAccessor = fieldAccessor.compose(getField('touchState'))
  const validityStateAccessor = fieldAccessor.compose(getField('validityState'))
  const valueStateAccessor = fieldAccessor.compose(getField('valueState'))
  return {
    valueAccessor,
    errorAccessor,
    touchStateAccessor,
    validityStateAccessor,
    valueStateAccessor
  }
}

const createSagas = <
  FormDefinition,
  FormFieldName extends keyof FormDefinition = keyof FormDefinition
>(
  formName: string,
  fieldName: FormFieldName,
  fieldAccessor: FormFieldsAccessors<FormDefinition>[FormFieldName],
  rules: FormRules<FormDefinition>
) => {
  const formNameUpper = toSnakeUpperCase(formName.toString())
  const fieldNameUpper = toSnakeUpperCase(fieldName.toString())
  return [
    takeLatest(`FORM/${formNameUpper}/SET_${fieldNameUpper}`, function*(
      action: Action<FormDefinition[FormFieldName]>
    ) {
      const isValid = rules[fieldName].validate(action.payload)
      yield put(
        updateState([
          fieldAccessor.valueAccessor.set(action.payload),
          fieldAccessor.errorAccessor.set(
            isValid ? undefined : rules[fieldName].error(action.payload)
          ),
          fieldAccessor.validityStateAccessor.set(isValid ? 'valid' : 'invalid')
        ])
      )
    }),
    takeLatest(`FORM/${formNameUpper}/TOUCH_${fieldNameUpper}`, function*() {
      yield put(updateState([fieldAccessor.touchStateAccessor.set('touched')]))
    }),
    takeLatest(`FORM/${formNameUpper}/UNTOUCH_${fieldNameUpper}`, function*() {
      yield put(updateState([fieldAccessor.touchStateAccessor.set('untouched')]))
    }),
    takeLatest(`FORM/${formNameUpper}/CLEAR_${fieldNameUpper}`, function*() {
      const state: State<FormDefinition> = yield select()
      const value = fieldAccessor.valueAccessor.get(state)
      const cleared = (clearValue(value) as unknown) as FormDefinition[FormFieldName]
      const isValid = rules[fieldName].validate(cleared)
      yield put(
        updateState([
          fieldAccessor.valueAccessor.set(cleared),
          fieldAccessor.valueStateAccessor.set('pristine'),
          fieldAccessor.validityStateAccessor.set(isValid ? 'valid' : 'invalid'),
          fieldAccessor.errorAccessor.set(isValid ? undefined : rules[fieldName].error(cleared))
        ])
      )
    })
  ]
}

export function createForm<
  FormDefinition extends {
    [FieldName in keyof FormDefinition]: FormDefinition[FieldName]
  },
  FormFieldName extends keyof FormDefinition = keyof FormDefinition
>(
  formName: string,
  formData: FormDefinition,
  formRules: FormRules<FormDefinition>
): Form<FormDefinition> {
  const fieldNames = Object.keys(formData) as FormFieldName[]
  const forms = Lens.fromProp<State<FormDefinition>>()('forms')
  const form = Lens.fromProp<StateForms<FormDefinition>>()(formName)
  const formAccessor = forms.compose(form)
  const formInstance = fieldNames.reduce(
    (instance, fieldName) => {
      const accessor = createAccessors(formAccessor, fieldName)
      return {
        initialState: {
          ...instance.initialState,
          [fieldName]: createInitialState(formData, fieldName, formRules)
        },
        accessors: {
          ...instance.accessors,
          [fieldName]: accessor
        },
        actions: {
          ...instance.actions,
          [fieldName]: createActions<FormDefinition>(formName, fieldName)
        },
        sagas: [...instance.sagas, ...createSagas(formName, fieldName, accessor, formRules)]
      }
    },
    ({
      initialState: {},
      accessors: {},
      actions: {},
      sagas: []
    } as unknown) as FormInstance<FormDefinition>
  )
  return {
    ...formInstance,
    accessor: (state: State<FormDefinition>) => ({
      state: {
        ...formAccessor.get(state),
        isValid: fieldNames.every(fieldName => {
          return formInstance.accessors[fieldName].validityStateAccessor.get(state) === 'valid'
        }),
        isPristine: fieldNames.every(fieldName => {
          return formInstance.accessors[fieldName].valueStateAccessor.get(state) === 'pristine'
        }),
        isTouched: fieldNames.every(fieldName => {
          return formInstance.accessors[fieldName].touchStateAccessor.get(state) === 'touched'
        })
      }
    }),
    actions: (dispatch: Dispatch) => ({
      actions: Object.entries(formInstance.actions).reduce(
        (actions, [key, val]) => ({
          ...actions,
          [key]: bindActionCreators(val as ActionCreatorsMapObject, dispatch)
        }),
        {} as FormFieldsActions<FormDefinition>
      )
    })
  }
}
