import { auth } from '../../utils/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);

  const result = await auth.api.listUsers({
    query: {
      searchValue: body.searchValue,
      searchField: body.searchField,
      searchOperator: body.searchOperator,
      limit: body.limit,
      offset: body.offset,
      sortBy: body.sortBy,
      sortDirection: body.sortDirection,
      filterField: body.filterField,
      filterValue: body.filterValue,
      filterOperator: body.filterOperator,
    },
    headers: getHeaders(event),
  });

  return result;
});
