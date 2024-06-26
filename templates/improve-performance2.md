Project Path: {{ absolute_code_path }}

I'd like your help improving the performance of this codebase. It works correctly, but we need it to be faster and more efficient. Analyze the code thoroughly with this goal in mind:

Source Tree:
```
{{ source_tree }}
``` 

{{#each files}}
{{#if code}}
`{{path}}`:

{{{code}}}

{{/if}}
{{/each}}

When looking for optimization opportunities, consider:
- Algorithm complexity and big O analysis 
- Expensive operations like disk/network I/O
- Unnecessary iterations or computations
- Repeated calculations of the same value 
- Inefficient data structures or data types
- Opportunities to cache or memoize results
- Parallelization with threads/async 
- More efficient built-in functions or libraries
- Query or code paths that can be short-circuited
- Reducing memory allocations and copying
- Compiler or interpreter optimizations to leverage
- Provide improvements that can take a source block and replace it in place avoiding creating of sub functions or new imports.

For each potential improvement, provide:
1. Specific suggestions for optimization

Then update the code with your changes. Be sure to maintain readability and organization. Minor optimizations that significantly reduce clarity are not worth it.
Document any new usage constraints (e.g. increased memory requirements).

Try to prioritize the changes that will have the largest impact on typical usage scenarios based on your understanding of the codebase. Let me know if you have any questions!

```json:schema
[
{
    "file": "full path to file that needs to be optimized",
    "replace_from": "old code",
    "replace_to": "new code",
    "reason": "reason for the change"
}
]
```